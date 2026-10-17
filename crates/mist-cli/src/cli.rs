use crate::agent::CodestralAgent;
use crate::config::resolve_config;
use crate::tools::types::ConfirmCallback;
use clap::Parser;
use colored::*;
use rustyline::error::ReadlineError;
use rustyline::DefaultEditor;
use std::io::{IsTerminal, Write};
use std::sync::Arc;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Parser, Debug, Clone)]
#[command(
    name = "mist",
    version = VERSION,
    about = "Developer CLI powered by Mistral AI (Codestral)"
)]
pub struct CliArgs {
    /// Override model name (default: codestral-latest)
    #[arg(short = 'm', long = "model")]
    pub model: Option<String>,

    /// Override API base URL
    #[arg(short = 'b', long = "base-url")]
    pub base_url: Option<String>,

    /// Optional prompt for one-shot execution
    #[arg(trailing_var_arg = true)]
    pub prompt: Vec<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ReplAction {
    Exit,
    Handled,
    Continue,
}

pub fn handle_repl_command(cmd: &str, agent: &mut CodestralAgent) -> ReplAction {
    match cmd {
        "/exit" | "/quit" => {
            println!("{}", "Goodbye!".bright_cyan());
            ReplAction::Exit
        }
        "/clear" => {
            agent.clear_history();
            println!("{}\n", "Conversation history reset.".yellow());
            ReplAction::Handled
        }
        "/history" => {
            println!(
                "{}\n",
                format!("Total messages in memory: {}", agent.get_history().len()).blue()
            );
            ReplAction::Handled
        }
        "/help" => {
            println!(
                "\n{}\n  {}     - Show this help menu\n  {}    - Clear conversation memory\n  {}  - Show message count\n  {}     - Exit CLI\n",
                "Available commands:".bold(),
                "/help".cyan(),
                "/clear".cyan(),
                "/history".cyan(),
                "/exit".cyan()
            );
            ReplAction::Handled
        }
        _ => ReplAction::Continue,
    }
}

pub fn create_prompt_confirmation() -> ConfirmCallback {
    Arc::new(|description: &str| {
        let desc = description.to_string();
        Box::pin(async move {
            if !std::io::stdin().is_terminal() {
                eprintln!(
                    "{} Automatically denied: '{}' (non-TTY environment).",
                    "[Security]".yellow(),
                    desc
                );
                return false;
            }

            eprint!(
                "\n{} Codestral requests permission to {}. Authorize? (y/N): ",
                "⚠️  [Security]".yellow().bold(),
                desc
            );
            let _ = std::io::stdout().flush();
            let _ = std::io::stderr().flush();

            let mut input = String::new();
            if std::io::stdin().read_line(&mut input).is_ok() {
                let trimmed = input.trim().to_lowercase();
                trimmed == "y" || trimmed == "yes" || trimmed == "s" || trimmed == "si"
            } else {
                false
            }
        })
    })
}

pub async fn run_one_shot(agent: &mut CodestralAgent, prompt: &str) -> i32 {
    agent.set_confirm_action(Some(create_prompt_confirmation()));
    match agent.chat(prompt).await {
        Ok(response) => {
            println!("\n{}\n", response);
            0
        }
        Err(err) => {
            eprintln!("\n{} {}\n", "Error:".red().bold(), err);
            1
        }
    }
}

pub async fn run_repl(agent: &mut CodestralAgent) -> Result<(), Box<dyn std::error::Error>> {
    let ws = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| ".".to_string());

    println!("{}", "=".repeat(60).green());
    println!("{} (v{})", "Mistral Codestral CLI".bold(), VERSION);
    println!("Workspace: {}", ws);
    println!(
        "Type your prompt or use {}, {}, or {}.",
        "/help".cyan(),
        "/clear".cyan(),
        "/exit".cyan()
    );
    println!("{}\n", "=".repeat(60).green());

    let mut rl = DefaultEditor::new()?;
    agent.set_confirm_action(Some(create_prompt_confirmation()));

    let on_call = Arc::new(|name: &str, args: &serde_json::Value| {
        println!(
            "{} Running '{}' with arguments: {}",
            "[Tool]".cyan().bold(),
            name,
            args
        );
    });
    let on_res = Arc::new(|name: &str, _res: &str| {
        println!("{} '{}' completed.", "[Tool]".green().bold(), name);
    });
    agent.set_tool_callbacks(Some(on_call), Some(on_res));

    loop {
        let readline = rl.readline(&format!("{} ", "codestral>".magenta().bold()));
        match readline {
            Ok(line) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let _ = rl.add_history_entry(trimmed);

                match handle_repl_command(trimmed, agent) {
                    ReplAction::Exit => break,
                    ReplAction::Handled => continue,
                    ReplAction::Continue => {}
                }

                match agent.chat(trimmed).await {
                    Ok(reply) => println!("\n{}\n", reply),
                    Err(err) => eprintln!("\n{} {}\n", "[Error]".red().bold(), err),
                }
            }
            Err(ReadlineError::Interrupted) | Err(ReadlineError::Eof) => {
                println!("{}", "\nGoodbye!".bright_cyan());
                break;
            }
            Err(err) => {
                eprintln!("\n{} {}\n", "[Error]".red().bold(), err);
                break;
            }
        }
    }

    Ok(())
}

pub async fn run_cli() -> i32 {
    let args = CliArgs::parse();

    let mut config = match resolve_config() {
        Ok(c) => c,
        Err(err) => {
            eprintln!("{} {}", "Configuration error:".red().bold(), err);
            eprintln!("\nYou can define it by running:");
            eprintln!("  export MISTRAL_API_KEY=\"your_api_key\"");
            eprintln!("  or by creating a .env file in this directory.");
            return 1;
        }
    };

    if let Some(m) = args.model {
        config.model = m;
    }
    if let Some(b) = args.base_url {
        config.server_url = b;
    }

    let workspace_dir = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let mut agent = CodestralAgent::new(config, workspace_dir, None);

    if !args.prompt.is_empty() {
        let prompt_text = args.prompt.join(" ");
        return run_one_shot(&mut agent, &prompt_text).await;
    }

    if !std::io::stdin().is_terminal() {
        use std::io::Read;
        let mut buffer = String::new();
        if std::io::stdin().read_to_string(&mut buffer).is_ok() && !buffer.trim().is_empty() {
            return run_one_shot(&mut agent, buffer.trim()).await;
        }
    }

    if std::io::stdout().is_terminal() {
        if let Err(e) = crate::ui::run_tui(agent).await {
            eprintln!("{} {}", "[Error]".red().bold(), e);
            return 1;
        }
        return 0;
    }

    if let Err(e) = run_repl(&mut agent).await {
        eprintln!("{} {}", "[Error]".red().bold(), e);
        return 1;
    }

    0
}
