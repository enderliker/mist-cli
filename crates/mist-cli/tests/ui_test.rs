use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use mist_cli::agent::CodestralAgent;
use mist_cli::config::MistralCliConfig;
use mist_cli::ui::app::App;
use mist_cli::ui::components::MessageRole;
use ratatui::backend::TestBackend;
use ratatui::Terminal;
use std::path::PathBuf;
use tokio::sync::{mpsc, oneshot};

fn create_test_agent() -> CodestralAgent {
    let config = MistralCliConfig {
        api_key: "dummy".to_string(),
        server_url: "https://api.mistral.ai".to_string(),
        model: "codestral-latest".to_string(),
    };
    CodestralAgent::new(config, PathBuf::from("/workspace/test"), None)
}

#[test]
fn test_ui_initial_render_with_test_backend() {
    let agent = create_test_agent();
    let mut app = App::new(&agent, "0.3.0-beta.1", "/workspace/test");

    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).expect("create test terminal");

    terminal.draw(|f| app.render(f)).expect("draw terminal");

    let buffer = terminal.backend().buffer();
    let content: String = buffer
        .content()
        .iter()
        .map(|c| c.symbol())
        .collect::<Vec<_>>()
        .join("");

    assert!(content.contains("Mistral Codestral CLI"));
    assert!(content.contains("v0.3.0-beta.1"));
    assert!(content.contains("codestral-latest"));
    assert!(content.contains("https://api.mistral.ai"));
    assert!(content.contains("/workspace/test"));
    assert!(content.contains("Type your prompt or /help to view available commands."));
    assert!(content.contains("codestral>"));
    assert!(content.contains("/help"));
    assert!(content.contains("/clear"));
    assert!(content.contains("/exit"));
}

#[test]
fn test_ui_message_rendering() {
    let agent = create_test_agent();
    let mut app = App::new(&agent, "0.3.0-beta.1", "/workspace/test");

    app.add_message(MessageRole::User, "Hello Codestral");
    app.add_message(MessageRole::ToolCall, "read_file (notes.txt)");
    app.add_message(MessageRole::ToolResult, "File read completed");
    app.add_message(MessageRole::Assistant, "Here is the summary of your file.");
    app.add_message(MessageRole::Error, "Something went wrong");

    let backend = TestBackend::new(100, 30);
    let mut terminal = Terminal::new(backend).expect("create test terminal");

    terminal.draw(|f| app.render(f)).expect("draw terminal");

    let buffer = terminal.backend().buffer();
    let content: String = buffer
        .content()
        .iter()
        .map(|c| c.symbol())
        .collect::<Vec<_>>()
        .join("");

    assert!(content.contains("❯ Hello Codestral"));
    assert!(content.contains("[Tool]"));
    assert!(content.contains("read_file (notes.txt)"));
    assert!(content.contains("[Result]"));
    assert!(content.contains("File read completed"));
    assert!(content.contains("Codestral:"));
    assert!(content.contains("Here is the summary of your file."));
    assert!(content.contains("[Error]"));
    assert!(content.contains("Something went wrong"));
}

#[test]
fn test_ui_input_key_handling() {
    let agent = create_test_agent();
    let mut app = App::new(&agent, "0.3.0-beta.1", "/workspace/test");

    let (prompt_tx, mut prompt_rx) = mpsc::channel(10);
    let (reset_tx, _reset_rx) = mpsc::channel(10);

    // Type "hello"
    for c in "hello".chars() {
        app.handle_key(
            KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE),
            &prompt_tx,
            &reset_tx,
            1,
        );
    }
    assert_eq!(app.input_val, "hello");

    // Backspace
    app.handle_key(
        KeyEvent::new(KeyCode::Backspace, KeyModifiers::NONE),
        &prompt_tx,
        &reset_tx,
        1,
    );
    assert_eq!(app.input_val, "hell");

    // Enter -> dispatches prompt
    app.handle_key(
        KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE),
        &prompt_tx,
        &reset_tx,
        1,
    );
    assert_eq!(app.input_val, "");
    assert_eq!(prompt_rx.try_recv().unwrap(), "hell");
    assert!(app.is_loading);
}

#[test]
fn test_ui_security_prompt_modal() {
    let agent = create_test_agent();
    let mut app = App::new(&agent, "0.3.0-beta.1", "/workspace/test");

    let (resp_tx, mut resp_rx) = oneshot::channel();
    app.confirm_state = Some((
        "execute sandboxed command 'cargo test'".to_string(),
        resp_tx,
    ));

    let backend = TestBackend::new(100, 24);
    let mut terminal = Terminal::new(backend).expect("create test terminal");

    terminal.draw(|f| app.render(f)).expect("draw terminal");

    let buffer = terminal.backend().buffer();
    let content: String = buffer
        .content()
        .iter()
        .map(|c| c.symbol())
        .collect::<Vec<_>>()
        .join("");

    assert!(content.contains("Security Authorization Required"));
    assert!(content.contains("execute sandboxed command 'cargo test'"));
    assert!(content.contains("[y] to confirm"));
    assert!(content.contains("[n] to deny"));

    let (prompt_tx, _) = mpsc::channel(10);
    let (reset_tx, _) = mpsc::channel(10);

    // Press 'y' to authorize
    app.handle_key(
        KeyEvent::new(KeyCode::Char('y'), KeyModifiers::NONE),
        &prompt_tx,
        &reset_tx,
        1,
    );

    assert!(resp_rx.try_recv().unwrap());
    assert!(app.confirm_state.is_none());
}
