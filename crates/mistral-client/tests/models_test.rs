use mistral_client::models::{
    ChatCompletionRequest, ChatCompletionResponse, ChatMessage, FinishReason, FunctionCall,
    FunctionDefinition, Role, Tool, ToolCall, ToolChoice,
};
use serde_json::json;

#[test]
fn test_chat_message_system_serialization() {
    let msg = ChatMessage::system("You are a helpful coding assistant.");
    let serialized = serde_json::to_value(&msg).expect("serialize system message");

    assert_eq!(
        serialized,
        json!({
            "role": "system",
            "content": "You are a helpful coding assistant."
        })
    );
}

#[test]
fn test_chat_message_user_serialization() {
    let msg = ChatMessage::user("Hello, Codestral!");
    let serialized = serde_json::to_value(&msg).expect("serialize user message");

    assert_eq!(
        serialized,
        json!({
            "role": "user",
            "content": "Hello, Codestral!"
        })
    );
}

#[test]
fn test_chat_message_assistant_with_tool_calls_serialization() {
    let tool_call = ToolCall {
        id: "call_abc123".to_string(),
        tool_type: "function".to_string(),
        function: FunctionCall {
            name: "read_file".to_string(),
            arguments: "{\"path\":\"sample.txt\"}".to_string(),
        },
    };

    let msg = ChatMessage::assistant_with_tool_calls(None, vec![tool_call]);
    let serialized = serde_json::to_value(&msg).expect("serialize assistant message");

    assert_eq!(
        serialized,
        json!({
            "role": "assistant",
            "content": null,
            "tool_calls": [
                {
                    "id": "call_abc123",
                    "type": "function",
                    "function": {
                        "name": "read_file",
                        "arguments": "{\"path\":\"sample.txt\"}"
                    }
                }
            ]
        })
    );
}

#[test]
fn test_chat_message_tool_result_serialization() {
    let msg = ChatMessage::tool(
        "call_abc123",
        "file content here",
        Some("read_file".to_string()),
    );
    let serialized = serde_json::to_value(&msg).expect("serialize tool message");

    assert_eq!(
        serialized,
        json!({
            "role": "tool",
            "tool_call_id": "call_abc123",
            "name": "read_file",
            "content": "file content here"
        })
    );
}

#[test]
fn test_tool_definition_serialization() {
    let tool = Tool {
        tool_type: "function".to_string(),
        function: FunctionDefinition {
            name: "write_file".to_string(),
            description: "Writes a file to workspace.".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["path", "content"]
            }),
        },
    };

    let serialized = serde_json::to_value(&tool).expect("serialize tool");

    assert_eq!(
        serialized,
        json!({
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Writes a file to workspace.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "content": { "type": "string" }
                    },
                    "required": ["path", "content"]
                }
            }
        })
    );
}

#[test]
fn test_chat_completion_request_serialization() {
    let req = ChatCompletionRequest {
        model: "codestral-latest".to_string(),
        messages: vec![
            ChatMessage::system("system prompt"),
            ChatMessage::user("user prompt"),
        ],
        tools: None,
        tool_choice: Some(ToolChoice::Auto),
        temperature: Some(0.2),
        top_p: Some(0.9),
        max_tokens: Some(4096),
        stream: Some(false),
        random_seed: Some(42),
    };

    let serialized = serde_json::to_value(&req).expect("serialize request");

    assert_eq!(serialized["model"], "codestral-latest");
    assert_eq!(serialized["messages"].as_array().unwrap().len(), 2);
    assert_eq!(serialized["tool_choice"], "auto");
    assert_eq!(serialized["temperature"], 0.2);
    assert_eq!(serialized["max_tokens"], 4096);
    assert_eq!(serialized["stream"], false);
    assert_eq!(serialized["random_seed"], 42);
}

#[test]
fn test_chat_completion_response_deserialization() {
    let json_data = json!({
        "id": "cmpl-test-123",
        "object": "chat.completion",
        "model": "codestral-latest",
        "created": 1729112233,
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
                                "arguments": "{\"path\":\"README.md\"}"
                            }
                        }
                    ]
                },
                "finish_reason": "tool_calls"
            }
        ],
        "usage": {
            "prompt_tokens": 120,
            "completion_tokens": 45,
            "total_tokens": 165
        }
    });

    let resp: ChatCompletionResponse =
        serde_json::from_value(json_data).expect("deserialize response");

    assert_eq!(resp.id, "cmpl-test-123");
    assert_eq!(resp.model, "codestral-latest");
    assert_eq!(resp.choices.len(), 1);

    let choice = &resp.choices[0];
    assert_eq!(choice.index, 0);
    assert_eq!(choice.finish_reason, Some(FinishReason::ToolCalls));

    let msg = &choice.message;
    assert_eq!(msg.role, Role::Assistant);
    assert_eq!(msg.content, None);

    let tool_calls = msg.tool_calls.as_ref().expect("has tool calls");
    assert_eq!(tool_calls.len(), 1);
    assert_eq!(tool_calls[0].id, "call_123");
    assert_eq!(tool_calls[0].function.name, "read_file");
    assert_eq!(tool_calls[0].function.arguments, "{\"path\":\"README.md\"}");

    let usage = resp.usage.as_ref().expect("has usage");
    assert_eq!(usage.prompt_tokens, 120);
    assert_eq!(usage.completion_tokens, 45);
    assert_eq!(usage.total_tokens, 165);
}
