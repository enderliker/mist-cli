use super::types::{is_path_inside, ConfirmCallback};
use serde_json::json;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

const IGNORED_NAMES: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    ".gemini",
    ".DS_Store",
    "target",
    ".codex",
    ".agents",
];

const MAX_RECURSIVE_ENTRIES: usize = 500;
const MAX_RECURSIVE_DEPTH: usize = 6;

pub async fn execute_list_files(
    args: serde_json::Value,
    workspace_dir: &Path,
    _on_confirm: &Option<ConfirmCallback>,
) -> String {
    let raw_path = args
        .get("path")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(".");

    let recursive = args
        .get("recursive")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let resolved_path = workspace_dir.join(raw_path);

    if !is_path_inside(workspace_dir, &resolved_path) {
        return json!({
            "error": format!("Access denied: Path '{}' is outside the allowed workspace.", raw_path)
        })
        .to_string();
    }

    if !resolved_path.exists() {
        return json!({
            "error": format!("Directory '{}' does not exist in the workspace.", raw_path)
        })
        .to_string();
    }

    let metadata = match fs::metadata(&resolved_path) {
        Ok(m) => m,
        Err(e) => {
            return json!({ "error": format!("Failed to read metadata for '{}': {}", raw_path, e) })
                .to_string();
        }
    };

    if !metadata.is_dir() {
        return json!({
            "error": format!("'{}' is a file, not a directory. Use 'read_file' to view its content.", raw_path)
        })
        .to_string();
    }

    let ignored_set: HashSet<&str> = IGNORED_NAMES.iter().copied().collect();

    let mut entries = Vec::new();
    let mut truncated = false;

    if recursive {
        fn collect_recursive(
            dir: &Path,
            base_dir: &Path,
            ignored: &HashSet<&str>,
            depth: usize,
            out: &mut Vec<serde_json::Value>,
            truncated: &mut bool,
        ) {
            if depth > MAX_RECURSIVE_DEPTH || out.len() >= MAX_RECURSIVE_ENTRIES {
                if out.len() >= MAX_RECURSIVE_ENTRIES {
                    *truncated = true;
                }
                return;
            }

            let rd = match fs::read_dir(dir) {
                Ok(rd) => rd,
                Err(_) => return,
            };

            for entry in rd.flatten() {
                if out.len() >= MAX_RECURSIVE_ENTRIES {
                    *truncated = true;
                    break;
                }

                let name_os = entry.file_name();
                let name = match name_os.to_str() {
                    Some(n) => n,
                    None => continue,
                };

                if ignored.contains(name) {
                    continue;
                }

                let path = entry.path();
                let rel_path = match path.strip_prefix(base_dir) {
                    Ok(p) => p.to_string_lossy().to_string(),
                    Err(_) => name.to_string(),
                };

                let file_type = match entry.file_type() {
                    Ok(ft) => {
                        if ft.is_dir() {
                            "directory"
                        } else {
                            "file"
                        }
                    }
                    Err(_) => "file",
                };

                out.push(json!({
                    "name": rel_path,
                    "type": file_type
                }));

                if file_type == "directory" {
                    collect_recursive(&path, base_dir, ignored, depth + 1, out, truncated);
                }
            }
        }

        collect_recursive(&resolved_path, &resolved_path, &ignored_set, 0, &mut entries, &mut truncated);
    } else {
        let rd = match fs::read_dir(&resolved_path) {
            Ok(rd) => rd,
            Err(e) => {
                return json!({ "error": format!("Error listing directory '{}': {}", raw_path, e) })
                    .to_string();
            }
        };

        for entry in rd.flatten() {
            let name_os = entry.file_name();
            let name = match name_os.to_str() {
                Some(n) => n,
                None => continue,
            };

            if ignored_set.contains(name) {
                continue;
            }

            let file_type = match entry.file_type() {
                Ok(ft) => {
                    if ft.is_dir() {
                        "directory"
                    } else {
                        "file"
                    }
                }
                Err(_) => "file",
            };

            entries.push(json!({
                "name": name,
                "type": file_type
            }));
        }
    }

    entries.sort_by(|a, b| {
        let type_a = a["type"].as_str().unwrap_or("");
        let type_b = b["type"].as_str().unwrap_or("");
        if type_a != type_b {
            if type_a == "directory" {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        } else {
            let name_a = a["name"].as_str().unwrap_or("");
            let name_b = b["name"].as_str().unwrap_or("");
            name_a.cmp(name_b)
        }
    });

    json!({
        "path": raw_path,
        "total_entries": entries.len(),
        "truncated": truncated,
        "entries": entries
    })
    .to_string()
}
