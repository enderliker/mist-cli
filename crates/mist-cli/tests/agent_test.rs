use mist_cli::agent::{build_system_prompt, CodestralAgent};
use mist_cli::config::MistralCliConfig;
use mistral_client::models::{ChatMessage, Role};
use mistral_client::MistralClient;
use serde_json::json;
use std::fs;
use tempfile::tempdir;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn test_build_system_prompt_contains_context_and_guidelines() {
    let tmp = tempdir().expect("create temp dir");
    let prompt = build_system_prompt(Some(tmp.path()));

    assert!(prompt.contains("Codestral"));
    assert!(prompt.contains("Workspace Root:"));
    assert!(prompt.contains("read_file"));
    assert!(prompt.contains("edit_file"));
    assert!(prompt.contains("Security Principles:"));
}

#[tokio::test]
async fn test_agent_tool_calling_loop_with_wiremock() {
    let mock_server = MockServer::start().await;
    let tmp = tempdir().expect("create temp dir");
    let ws = tmp.path();

    // Create a dummy file in workspace
    fs::write(ws.join("notes.txt"), "Important Secret Plan").unwrap();

    // Mock 1: Model requests read_file tool call
    let response_1 = json!({
        "id": "chat-step-1",
        "object": "chat.completion",
        "model": "codestral-latest",
        "created": 123456789,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [
                        {
                            "id": "call_123",
                            "type": "function",
                            "function": {
                                "name": "read_file",
                                "arguments": "{\"path\": \"notes.txt\"}"
                            }
                        }
                    ]
                },
                "finish_reason": "tool_calls"
            }
        ],
        "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 }
    });

    // Mock 2: After receiving tool result, model returns final answer
    let response_2 = json!({
        "id": "chat-step-2",
        "object": "chat.completion",
        "model": "codestral-latest",
        "created": 123456790,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "The note contains: Important Secret Plan",
                    "tool_calls": null
                },
                "finish_reason": "stop"
            }
        ],
        "usage": { "prompt_tokens": 25, "completion_tokens": 10, "total_tokens": 35 }
    });

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response_1))
        .up_to_n_times(1)
        .mount(&mock_server)
        .await;

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response_2))
        .mount(&mock_server)
        .await;

    let config = MistralCliConfig {
        api_key: "test-api-key".to_string(),
        server_url: mock_server.uri(),
        model: "codestral-latest".to_string(),
    };
    let client = MistralClient::new(&config.api_key).with_server_url(&config.server_url);

    let mut agent = CodestralAgent::new(config, ws.to_path_buf(), Some(client));

    let answer = agent
        .chat("What does notes.txt say?")
        .await
        .expect("agent chat success");

    assert_eq!(answer, "The note contains: Important Secret Plan");

    let history = agent.get_history();
    // System message, User message, Assistant tool call, Tool result, Assistant final answer
    assert_eq!(history.len(), 5);
    assert_eq!(history[0].role, Role::System);
    assert_eq!(history[1].role, Role::User);
    assert_eq!(history[2].role, Role::Assistant);
    assert_eq!(history[3].role, Role::Tool);
    assert_eq!(history[4].role, Role::Assistant);
}

#[tokio::test]
async fn test_agent_sliding_window_pruning() {
    let tmp = tempdir().expect("create temp dir");
    let ws = tmp.path();

    let config = MistralCliConfig {
        api_key: "dummy".to_string(),
        server_url: "http://localhost".to_string(),
        model: "codestral-latest".to_string(),
    };

    let mut agent = CodestralAgent::new(config, ws.to_path_buf(), None);
    agent.set_max_history_messages(4);

    // Push 6 messages manually into history
    agent.push_message(ChatMessage::user("Question 1"));
    agent.push_message(ChatMessage::assistant("Answer 1"));
    agent.push_message(ChatMessage::user("Question 2"));
    agent.push_message(ChatMessage::assistant("Answer 2"));
    agent.push_message(ChatMessage::user("Question 3"));
    agent.push_message(ChatMessage::assistant("Answer 3"));

    agent.prune_history();

    let history = agent.get_history();
    // System message is always preserved at index 0
    assert_eq!(history[0].role, Role::System);
    // Preserved messages should not exceed max_history_messages + 1
    assert!(history.len() <= 5);
    // And first kept non-system message must be a user turn
    assert_eq!(history[1].role, Role::User);
}
