use mist_cli::tools::list_files::execute_list_files;
use mist_cli::tools::search_files::execute_search_files;
use serde_json::json;
use std::fs;
use tempfile::tempdir;

#[tokio::test]
async fn test_list_files_and_noise_filtering() {
    let tmp = tempdir().expect("create temp dir");
    let ws = tmp.path();

    fs::create_dir_all(ws.join("src")).unwrap();
    fs::create_dir_all(ws.join("node_modules/fake")).unwrap();
    fs::create_dir_all(ws.join(".git/objects")).unwrap();

    fs::write(ws.join("src/main.rs"), "fn main() {}").unwrap();
    fs::write(ws.join("node_modules/fake/index.js"), "module.exports = 1;").unwrap();

    let list_res = execute_list_files(json!({ "path": ".", "recursive": true }), ws, &None).await;

    assert!(list_res.contains("src/main.rs") || list_res.contains("main.rs"));
    assert!(!list_res.contains("node_modules"));
    assert!(!list_res.contains(".git"));
}

#[tokio::test]
async fn test_search_files_regex_and_line_numbers() {
    let tmp = tempdir().expect("create temp dir");
    let ws = tmp.path();

    fs::create_dir_all(ws.join("src")).unwrap();
    fs::write(
        ws.join("src/lib.rs"),
        "pub fn calculate(x: i32) -> i32 {\n    // target pattern\n    x * 2\n}",
    )
    .unwrap();

    let search_res = execute_search_files(
        json!({
            "pattern": "target pattern",
            "path": "."
        }),
        ws,
        &None,
    )
    .await;

    let res_json: serde_json::Value = serde_json::from_str(&search_res).expect("parse search json");
    assert_eq!(res_json["matches_count"], 1);
    let match_entry = &res_json["matches"][0];
    assert_eq!(match_entry["file"], "src/lib.rs");
    assert_eq!(match_entry["line"], 2);
    assert!(match_entry["text"]
        .as_str()
        .unwrap()
        .contains("target pattern"));
}

#[tokio::test]
async fn test_search_files_ignores_sensitive_files() {
    let tmp = tempdir().expect("create temp dir");
    let ws = tmp.path();

    fs::write(ws.join(".env"), "SECRET_TOKEN=super_secret_value").unwrap();
    fs::write(ws.join("id_rsa"), "PRIVATE KEY DATA").unwrap();
    fs::create_dir_all(ws.join("src")).unwrap();
    fs::write(ws.join("src/config.rs"), "pub const TOKEN_VAR: &str = \"SECRET_TOKEN\";").unwrap();

    let search_res = execute_search_files(
        json!({
            "pattern": "SECRET_TOKEN",
            "path": "."
        }),
        ws,
        &None,
    )
    .await;

    let res_json: serde_json::Value = serde_json::from_str(&search_res).expect("parse search json");
    assert_eq!(res_json["matches_count"], 1);
    assert_eq!(res_json["matches"][0]["file"], "src/config.rs");
    assert!(!search_res.contains("super_secret_value"));
}
