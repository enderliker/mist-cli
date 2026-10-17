use clap::Parser;
use mist_cli::agent::CodestralAgent;
use mist_cli::cli::{handle_repl_command, run_one_shot, CliArgs, ReplAction};
use mist_cli::config::MistralCliConfig;
use mistral_client::MistralClient;
use serde_json::json;
use tempfile::tempdir;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[test]
fn test_cli_args_parsing() {
    let args = CliArgs::parse_from([
        "mistral-cli",
        "-m",
        "custom-model",
        "-b",
        "https://custom.api.mistral.ai",
        "Explain",
        "the",
        "codebase",
    ]);

    assert_eq!(args.model.as_deref(), Some("custom-model"));
    assert_eq!(
        args.base_url.as_deref(),
        Some("https://custom.api.mistral.ai")
    );
    assert_eq!(args.prompt.join(" "), "Explain the codebase");
    assert!(!args.repl);

    let repl_args = CliArgs::parse_from(["mist", "--repl"]);
    assert!(repl_args.repl);
}

#[tokio::test]
async fn test_handle_repl_commands() {
    let tmp = tempdir().expect("create temp dir");
    let config = MistralCliConfig {
        api_key: "dummy".to_string(),
        server_url: "http://localhost".to_string(),
        model: "codestral-latest".to_string(),
    };
    let mut agent = CodestralAgent::new(config, tmp.path().to_path_buf(), None);

    assert_eq!(handle_repl_command("/exit", &mut agent), ReplAction::Exit);
    assert_eq!(handle_repl_command("/quit", &mut agent), ReplAction::Exit);
    assert_eq!(
        handle_repl_command("/help", &mut agent),
        ReplAction::Handled
    );
    assert_eq!(
        handle_repl_command("/history", &mut agent),
        ReplAction::Handled
    );
    assert_eq!(
        handle_repl_command("/clear", &mut agent),
        ReplAction::Handled
    );
    assert_eq!(
        handle_repl_command("Hello agent", &mut agent),
        ReplAction::Continue
    );
}

#[tokio::test]
async fn test_run_one_shot_execution() {
    let mock_server = MockServer::start().await;
    let tmp = tempdir().expect("create temp dir");

    let response = json!({
        "id": "chat-oneshot",
        "object": "chat.completion",
        "model": "codestral-latest",
        "created": 123456789,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "One-shot response text",
                    "tool_calls": null
                },
                "finish_reason": "stop"
            }
        ],
        "usage": { "prompt_tokens": 5, "completion_tokens": 5, "total_tokens": 10 }
    });

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response))
        .mount(&mock_server)
        .await;

    let config = MistralCliConfig {
        api_key: "key".to_string(),
        server_url: mock_server.uri(),
        model: "codestral-latest".to_string(),
    };
    let client = MistralClient::new(&config.api_key).with_server_url(&config.server_url);
    let mut agent = CodestralAgent::new(config, tmp.path().to_path_buf(), Some(client));

    let status = run_one_shot(&mut agent, "Test question").await;
    assert_eq!(status, 0);
}
