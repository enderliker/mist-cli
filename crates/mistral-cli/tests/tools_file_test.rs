use mistral_cli::tools::edit_file::execute_edit_file;
use mistral_cli::tools::read_file::execute_read_file;
use mistral_cli::tools::write_file::execute_write_file;
use serde_json::json;
use std::fs;
use std::sync::Arc;
use tempfile::tempdir;

#[tokio::test]
async fn test_write_read_and_edit_file_flow() {
    let tmp = tempdir().expect("create temp dir");
    let ws = tmp.path();

    // 1. Write file
    let write_res = execute_write_file(
        json!({
            "path": "src/hello.txt",
            "content": "Line 1\nHello World\nLine 3"
        }),
        ws,
        &None,
    )
    .await;
    let write_json: serde_json::Value = serde_json::from_str(&write_res).expect("parse write json");
    assert_eq!(write_json["success"], true);

    // 2. Read file
    let read_res = execute_read_file(
        json!({
            "path": "src/hello.txt",
            "start_line": 2,
            "end_line": 2
        }),
        ws,
        &None,
    )
    .await;
    let read_json: serde_json::Value = serde_json::from_str(&read_res).expect("parse read json");
    assert_eq!(read_json["content"], "Hello World");

    // 3. Edit file
    let edit_res = execute_edit_file(
        json!({
            "path": "src/hello.txt",
            "target_content": "Hello World",
            "replacement_content": "Hello Rust"
        }),
        ws,
        &None,
    )
    .await;
    let edit_json: serde_json::Value = serde_json::from_str(&edit_res).expect("parse edit json");
    assert_eq!(edit_json["success"], true);

    // 4. Verify updated file content
    let final_content = fs::read_to_string(ws.join("src/hello.txt")).expect("read file");
    assert_eq!(final_content, "Line 1\nHello Rust\nLine 3");
}

#[tokio::test]
async fn test_sensitive_file_protections() {
    let tmp = tempdir().expect("create temp dir");
    let ws = tmp.path();

    // Sensitive write without confirm denied
    let write_res = execute_write_file(
        json!({
            "path": ".env",
            "content": "SECRET_KEY=123"
        }),
        ws,
        &None,
    )
    .await;
    assert!(write_res.contains("Access denied"));

    // Sensitive write with user denial cancelled
    let denied_cb: mistral_cli::tools::types::ConfirmCallback =
        Arc::new(|_| Box::pin(async { false }));

    let write_denied = execute_write_file(
        json!({
            "path": ".env",
            "content": "SECRET_KEY=123"
        }),
        ws,
        &Some(denied_cb),
    )
    .await;
    assert!(write_denied.contains("denied"));
    assert!(!ws.join(".env").exists());

    // Sensitive write with user approval succeeds
    let approved_cb: mistral_cli::tools::types::ConfirmCallback =
        Arc::new(|_| Box::pin(async { true }));

    let write_approved = execute_write_file(
        json!({
            "path": ".env",
            "content": "SECRET_KEY=approved"
        }),
        ws,
        &Some(approved_cb.clone()),
    )
    .await;
    assert!(write_approved.contains("saved successfully"));
    assert!(ws.join(".env").exists());

    // Sensitive read with approval succeeds
    let read_approved = execute_read_file(
        json!({ "path": ".env" }),
        ws,
        &Some(approved_cb),
    )
    .await;
    assert!(read_approved.contains("SECRET_KEY=approved"));
}

#[tokio::test]
async fn test_path_traversal_rejection() {
    let tmp = tempdir().expect("create temp dir");
    let ws = tmp.path();

    let res = execute_read_file(
        json!({ "path": "../outside.txt" }),
        ws,
        &None,
    )
    .await;
    assert!(res.contains("outside the allowed workspace"));
}
