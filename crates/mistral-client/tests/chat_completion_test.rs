use mistral_client::{
    ChatCompletionRequest, ChatMessage, FinishReason, FunctionDefinition, MistralClient,
    MistralError, Tool, ToolChoice,
};
use serde_json::json;
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn test_chat_complete_standard_text_response() {
    let mock_server = MockServer::start().await;

    let response_body = json!({
        "id": "cmpl-test-001",
        "object": "chat.completion",
        "model": "codestral-latest",
        "created": 1729110000,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Hello! I am Codestral, ready to help with code.",
                    "tool_calls": null
                },
                "finish_reason": "stop"
            }
        ],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 12,
            "total_tokens": 22
        }
    });

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .and(header("Authorization", "Bearer mock-api-key"))
        .and(header("Content-Type", "application/json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response_body))
        .mount(&mock_server)
        .await;

    let client = MistralClient::new("mock-api-key").with_server_url(mock_server.uri());

    let req = ChatCompletionRequest {
        model: "codestral-latest".to_string(),
        messages: vec![ChatMessage::user("Hi there")],
        tools: None,
        tool_choice: None,
        temperature: Some(0.2),
        top_p: None,
        max_tokens: Some(100),
        stream: Some(false),
        random_seed: None,
    };

    let response = client
        .chat()
        .complete(&req)
        .await
        .expect("chat completion call");

    assert_eq!(response.id, "cmpl-test-001");
    assert_eq!(response.choices.len(), 1);
    let choice = &response.choices[0];
    assert_eq!(choice.finish_reason, Some(FinishReason::Stop));
    assert_eq!(
        choice.message.content.as_deref(),
        Some("Hello! I am Codestral, ready to help with code.")
    );
    assert!(choice.message.tool_calls.is_none());
}

#[tokio::test]
async fn test_chat_complete_function_calling_response() {
    let mock_server = MockServer::start().await;

    let response_body = json!({
        "id": "cmpl-tool-002",
        "object": "chat.completion",
        "model": "codestral-latest",
        "created": 1729110000,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [
                        {
                            "id": "call_xyz890",
                            "type": "function",
                            "function": {
                                "name": "read_file",
                                "arguments": "{\"path\":\"src/main.rs\"}"
                            }
                        }
                    ]
                },
                "finish_reason": "tool_calls"
            }
        ],
        "usage": {
            "prompt_tokens": 50,
            "completion_tokens": 25,
            "total_tokens": 75
        }
    });

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .and(header("Authorization", "Bearer mock-api-key"))
        .respond_with(ResponseTemplate::new(200).set_body_json(response_body))
        .mount(&mock_server)
        .await;

    let client = MistralClient::new("mock-api-key").with_server_url(mock_server.uri());

    let tools = vec![Tool {
        tool_type: "function".to_string(),
        function: FunctionDefinition {
            name: "read_file".to_string(),
            description: "Read workspace file".to_string(),
            parameters: json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }),
        },
    }];

    let req = ChatCompletionRequest {
        model: "codestral-latest".to_string(),
        messages: vec![ChatMessage::user("Examine src/main.rs")],
        tools: Some(tools),
        tool_choice: Some(ToolChoice::Auto),
        temperature: None,
        top_p: None,
        max_tokens: None,
        stream: None,
        random_seed: None,
    };

    let response = client
        .chat()
        .complete(&req)
        .await
        .expect("tool call completion");

    assert_eq!(response.choices.len(), 1);
    let choice = &response.choices[0];
    assert_eq!(choice.finish_reason, Some(FinishReason::ToolCalls));

    let tool_calls = choice.message.tool_calls.as_ref().unwrap();
    assert_eq!(tool_calls.len(), 1);
    assert_eq!(tool_calls[0].id, "call_xyz890");
    assert_eq!(tool_calls[0].function.name, "read_file");
    assert_eq!(
        tool_calls[0].function.arguments,
        "{\"path\":\"src/main.rs\"}"
    );
}

#[tokio::test]
async fn test_chat_complete_api_error_response() {
    let mock_server = MockServer::start().await;

    let error_body = json!({
        "message": "Unauthorized: invalid or revoked API key"
    });

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(401).set_body_json(error_body))
        .mount(&mock_server)
        .await;

    let client = MistralClient::new("invalid-key").with_server_url(mock_server.uri());

    let req = ChatCompletionRequest {
        model: "codestral-latest".to_string(),
        messages: vec![ChatMessage::user("Test prompt")],
        tools: None,
        tool_choice: None,
        temperature: None,
        top_p: None,
        max_tokens: None,
        stream: None,
        random_seed: None,
    };

    let result = client.chat().complete(&req).await;

    match result {
        Err(MistralError::Api {
            status_code,
            message,
        }) => {
            assert_eq!(status_code, 401);
            assert_eq!(message, "Unauthorized: invalid or revoked API key");
        }
        other => panic!("Expected MistralError::Api, got {:?}", other),
    }
}

#[tokio::test]
async fn test_chat_complete_api_error_response_nested_object() {
    let mock_server = MockServer::start().await;

    let error_body = json!({
        "error": {
            "message": "Model 'codestral-latest' does not exist or you do not have access to it.",
            "type": "invalid_request_error"
        }
    });

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(404).set_body_json(error_body))
        .mount(&mock_server)
        .await;

    let client = MistralClient::new("key").with_server_url(mock_server.uri());

    let req = ChatCompletionRequest {
        model: "codestral-latest".to_string(),
        messages: vec![ChatMessage::user("Test prompt")],
        tools: None,
        tool_choice: None,
        temperature: None,
        top_p: None,
        max_tokens: None,
        stream: None,
        random_seed: None,
    };

    let result = client.chat().complete(&req).await;

    match result {
        Err(MistralError::Api {
            status_code,
            message,
        }) => {
            assert_eq!(status_code, 404);
            assert_eq!(
                message,
                "Model 'codestral-latest' does not exist or you do not have access to it."
            );
        }
        other => panic!("Expected MistralError::Api, got {:?}", other),
    }
}
