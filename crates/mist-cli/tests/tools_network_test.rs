use mist_cli::tools::execute_command::execute_execute_command;
use mist_cli::tools::fetch_web_page::{clean_html_to_markdown, execute_fetch_web_page};
use mist_cli::tools::sandbox::bubblewrap::is_bubblewrap_available;
use mist_cli::tools::types::ConfirmCallback;
use mist_cli::tools::web_search::execute_web_search;
use serde_json::json;
use std::sync::Arc;
use tempfile::tempdir;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn test_execute_command_confirmation_and_execution() {
    let tmp = tempdir().expect("create temp dir");
    let ws = tmp.path();

    // 1. Missing command error
    let res_empty = execute_execute_command(json!({ "command": "" }), ws, &None).await;
    assert!(res_empty.contains("required"));

    if !is_bubblewrap_available(None) {
        eprintln!("Bubblewrap not available on this environment, skipping command execution test.");
        return;
    }

    // 2. Denied when no confirm callback
    let res_no_confirm =
        execute_execute_command(json!({ "command": "echo test" }), ws, &None).await;
    assert!(res_no_confirm.contains("Execution denied"));

    // 3. User rejects confirmation
    let reject_cb: ConfirmCallback = Arc::new(|_| Box::pin(async { false }));
    let res_reject =
        execute_execute_command(json!({ "command": "echo test" }), ws, &Some(reject_cb)).await;
    assert!(res_reject.contains("Execution cancelled"));

    // 4. User approves confirmation -> runs sandboxed
    let approve_cb: ConfirmCallback = Arc::new(|_| Box::pin(async { true }));
    let res_approve = execute_execute_command(
        json!({ "command": "echo 'sandbox ok'" }),
        ws,
        &Some(approve_cb),
    )
    .await;
    let json_val: serde_json::Value =
        serde_json::from_str(&res_approve).expect("parse execution json");
    assert_eq!(json_val["exit_code"], 0);
    assert!(json_val["stdout"].as_str().unwrap().contains("sandbox ok"));
    assert_eq!(json_val["sandboxed"], true);
}

#[tokio::test]
async fn test_web_search_missing_key_and_mock_response() {
    // 1. Missing query
    let res_empty = execute_web_search(json!({ "query": "" }), Some("fake-key"), None).await;
    assert!(res_empty.contains("Missing required argument 'query'"));

    // 2. Missing API key
    let res_no_key = execute_web_search(json!({ "query": "rust lang" }), None, None).await;
    assert!(res_no_key.contains("TAVILY_API_KEY is not configured"));

    // 3. Mock Tavily response
    let mock_server = MockServer::start().await;
    let mock_response = json!({
        "query": "rust lang",
        "answer": "Rust is a systems programming language.",
        "results": [
            {
                "title": "Rust Programming Language",
                "url": "https://www.rust-lang.org",
                "content": "A language empowering everyone to build reliable and efficient software.",
                "score": 0.99
            }
        ]
    });

    Mock::given(method("POST"))
        .and(path("/search"))
        .respond_with(ResponseTemplate::new(200).set_body_json(mock_response))
        .mount(&mock_server)
        .await;

    let res_success = execute_web_search(
        json!({ "query": "rust lang" }),
        Some("mock-key"),
        Some(&format!("{}/search", mock_server.uri())),
    )
    .await;

    let parsed: serde_json::Value =
        serde_json::from_str(&res_success).expect("parse search response");
    assert_eq!(parsed["query"], "rust lang");
    assert_eq!(parsed["results_count"], 1);
    assert_eq!(parsed["results"][0]["title"], "Rust Programming Language");
}

#[tokio::test]
async fn test_fetch_web_page_html_cleaning_and_fallback() {
    // 1. Invalid protocol
    let res_invalid =
        execute_fetch_web_page(json!({ "url": "ftp://example.com" }), None, None).await;
    assert!(res_invalid.contains("Invalid URL protocol"));

    // 2. Clean HTML markdown converter
    let html = r##"
        <html>
            <head><title>Test Page</title><style>.hidden { display: none; }</style></head>
            <body>
                <nav><a href="/">Home</a></nav>
                <h1>Welcome to Test</h1>
                <p>This is a paragraph with <a href="#">link</a> and &amp; entities.</p>
                <footer>Copyright 2026</footer>
            </body>
        </html>
    "##;
    let md = clean_html_to_markdown(html);
    assert!(md.contains("# Welcome to Test"));
    assert!(md.contains("This is a paragraph with link and & entities."));
    assert!(!md.contains("display: none"));
    assert!(!md.contains("<nav>"));

    // 3. Native fetch mock test
    let mock_server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/doc"))
        .respond_with(ResponseTemplate::new(200).set_body_string(html))
        .mount(&mock_server)
        .await;

    let res_fetch = execute_fetch_web_page(
        json!({ "url": format!("{}/doc", mock_server.uri()) }),
        None,
        None,
    )
    .await;

    let parsed: serde_json::Value = serde_json::from_str(&res_fetch).expect("parse fetch response");
    assert_eq!(parsed["engine"], "native_fetch");
    assert!(parsed["content"]
        .as_str()
        .unwrap()
        .contains("# Welcome to Test"));
}
