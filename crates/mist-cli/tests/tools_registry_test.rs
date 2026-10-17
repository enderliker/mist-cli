use mist_cli::tools::registry::ToolRegistry;
use serde_json::json;
use tempfile::tempdir;

#[tokio::test]
async fn test_registry_registration_and_definition_count() {
    let registry = ToolRegistry::new_default();
    let defs = registry.get_tool_definitions();
    assert_eq!(defs.len(), 8);

    let names: Vec<String> = defs.into_iter().map(|d| d.function.name).collect();
    assert!(names.contains(&"read_file".to_string()));
    assert!(names.contains(&"write_file".to_string()));
    assert!(names.contains(&"edit_file".to_string()));
    assert!(names.contains(&"list_files".to_string()));
    assert!(names.contains(&"search_files".to_string()));
    assert!(names.contains(&"execute_command".to_string()));
    assert!(names.contains(&"web_search".to_string()));
    assert!(names.contains(&"fetch_web_page".to_string()));
}

#[tokio::test]
async fn test_registry_execute_dispatch() {
    let registry = ToolRegistry::new_default();
    let tmp = tempdir().expect("create temp dir");
    let ws = tmp.path();

    // 1. Dispatching unknown tool returns clean error
    let unknown_res = registry
        .execute_tool("unknown_tool", json!({}), ws, &None)
        .await;
    assert!(unknown_res.contains("Tool 'unknown_tool' is not registered in the system."));

    // 2. Dispatching known tool (write_file + read_file)
    let write_res = registry
        .execute_tool(
            "write_file",
            json!({ "path": "test.txt", "content": "Rust Registry Dispatch" }),
            ws,
            &None,
        )
        .await;
    assert!(write_res.contains("saved successfully"));

    let read_res = registry
        .execute_tool("read_file", json!({ "path": "test.txt" }), ws, &None)
        .await;
    assert!(read_res.contains("Rust Registry Dispatch"));
}
