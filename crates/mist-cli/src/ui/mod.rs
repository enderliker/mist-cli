pub mod app;
pub mod components;

use crate::agent::CodestralAgent;
use app::{App, AppEvent};
use components::MessageRole;
use crossterm::event::{DisableMouseCapture, EnableMouseCapture, Event};
use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;
use std::io::stdout;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot};

struct TerminalGuard;

impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let _ = disable_raw_mode();
        let _ = execute!(stdout(), LeaveAlternateScreen, DisableMouseCapture);
    }
}

pub async fn run_tui(mut agent: CodestralAgent) -> Result<(), Box<dyn std::error::Error>> {
    enable_raw_mode()?;
    let mut out = stdout();
    execute!(out, EnterAlternateScreen, EnableMouseCapture)?;
    let _guard = TerminalGuard;

    let backend = CrosstermBackend::new(out);
    let mut terminal = Terminal::new(backend)?;

    let ws = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| ".".to_string());

    let version = env!("CARGO_PKG_VERSION");
    let mut app = App::new(&agent, version, &ws);

    let (event_tx, mut event_rx) = mpsc::channel::<AppEvent>(100);
    let (prompt_tx, mut prompt_rx) = mpsc::channel::<String>(10);
    let (reset_tx, mut reset_rx) = mpsc::channel::<()>(10);

    let history_count = Arc::new(AtomicUsize::new(agent.get_history().len()));

    // 1. Hook up confirm callback to TUI modal
    let confirm_tx = event_tx.clone();
    agent.set_confirm_action(Some(Arc::new(move |desc: &str| {
        let tx = confirm_tx.clone();
        let description = desc.to_string();
        Box::pin(async move {
            let (resp_tx, resp_rx) = oneshot::channel();
            if tx
                .send(AppEvent::SecurityConfirmRequest {
                    description,
                    respond_to: resp_tx,
                })
                .await
                .is_err()
            {
                return false;
            }
            resp_rx.await.unwrap_or(false)
        })
    })));

    // 2. Hook up tool event callbacks
    let tool_call_tx = event_tx.clone();
    let on_call = Arc::new(move |name: &str, args: &serde_json::Value| {
        let _ = tool_call_tx.try_send(AppEvent::ToolCall {
            name: name.to_string(),
            args: args.to_string(),
        });
    });

    let tool_result_tx = event_tx.clone();
    let on_res = Arc::new(move |name: &str, _res: &str| {
        let _ = tool_result_tx.try_send(AppEvent::ToolResult {
            name: name.to_string(),
        });
    });

    agent.set_tool_callbacks(Some(on_call), Some(on_res));

    // 3. Spawn background agent execution worker
    let agent_event_tx = event_tx.clone();
    let history_count_clone = history_count.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(()) = reset_rx.recv() => {
                    agent.clear_history();
                    history_count_clone.store(agent.get_history().len(), Ordering::Relaxed);
                }
                Some(prompt) = prompt_rx.recv() => {
                    let result = agent.chat(&prompt).await.map_err(|e| e.to_string());
                    history_count_clone.store(agent.get_history().len(), Ordering::Relaxed);
                    let _ = agent_event_tx.send(AppEvent::AgentResponse(result)).await;
                }
                else => break,
            }
        }
    });

    // 4. Spawn terminal event reader
    // 4. Spawn dedicated blocking terminal event reader thread
    let term_event_tx = event_tx.clone();
    std::thread::Builder::new()
        .name("crossterm-reader".to_string())
        .spawn(move || {
            while let Ok(ev) = crossterm::event::read() {
                if term_event_tx
                    .blocking_send(AppEvent::TermEvent(ev))
                    .is_err()
                {
                    break;
                }
            }
        })?;

    // 5. Spawn 80ms animation tick timer
    let tick_tx = event_tx.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(80));
        loop {
            interval.tick().await;
            if tick_tx.send(AppEvent::Tick).await.is_err() {
                break;
            }
        }
    });

    // 6. Main UI loop with dirty redraw tracking
    let mut needs_redraw = true;

    while !app.should_exit {
        if needs_redraw {
            terminal.draw(|f| app.render(f))?;
            needs_redraw = false;
        }

        if let Some(event) = event_rx.recv().await {
            match event {
                AppEvent::Tick => {
                    if app.is_loading {
                        app.on_tick();
                        needs_redraw = true;
                    }
                }
                AppEvent::TermEvent(Event::Key(key)) => {
                    let count = history_count.load(Ordering::Relaxed);
                    app.handle_key(key, &prompt_tx, &reset_tx, count);
                    needs_redraw = true;
                }
                AppEvent::TermEvent(Event::Resize(_, _)) => {
                    needs_redraw = true;
                }
                AppEvent::TermEvent(_) => {}
                AppEvent::AgentResponse(res) => {
                    app.is_loading = false;
                    match res {
                        Ok(reply) => app.add_message(MessageRole::Assistant, reply),
                        Err(err) => app.add_message(MessageRole::Error, err),
                    }
                    needs_redraw = true;
                }
                AppEvent::ToolCall { name, args } => {
                    app.loading_text = format!("Running tool '{}'...", name);
                    app.add_message(
                        MessageRole::ToolCall,
                        format!("Running '{}' with arguments: {}", name, args),
                    );
                    needs_redraw = true;
                }
                AppEvent::ToolResult { name } => {
                    app.loading_text = "Codestral is thinking...".to_string();
                    app.add_message(MessageRole::ToolResult, format!("'{}' completed.", name));
                    needs_redraw = true;
                }
                AppEvent::SecurityConfirmRequest {
                    description,
                    respond_to,
                } => {
                    app.confirm_state = Some((description, respond_to));
                    needs_redraw = true;
                }
            }
        }
    }

    Ok(())
}
