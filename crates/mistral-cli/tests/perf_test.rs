use mistral_cli::tools::search_files::execute_search_files;
use serde_json::json;
use std::fs;
use std::time::Instant;
use tempfile::tempdir;

#[tokio::test]
async fn test_search_files_performance_baseline() {
    let tmp = tempdir().expect("create temp dir");
    let ws = tmp.path();

    // Create 200 files with 50 lines each
    for i in 0..200 {
        let dir = ws.join(format!("dir_{}", i % 10));
        fs::create_dir_all(&dir).unwrap();
        let content = (0..50)
            .map(|l| {
                if l == 25 && i == 42 {
                    "pub fn target_unique_symbol_to_find() -> i32 { 42 }"
                } else {
                    "// placeholder line of code in generated test file"
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(dir.join(format!("file_{}.rs", i)), content).unwrap();
    }

    let start = Instant::now();
    let res = execute_search_files(
        json!({
            "pattern": "target_unique_symbol_to_find",
            "path": "."
        }),
        ws,
        &None,
    )
    .await;
    let elapsed = start.elapsed();

    println!("search_files on 200 files took: {:?}", elapsed);
    assert!(res.contains("target_unique_symbol_to_find"));
    // Enforce budget: must finish well under 200ms
    assert!(elapsed.as_millis() < 200);
}
