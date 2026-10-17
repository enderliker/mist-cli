use super::types::{is_path_inside, is_sensitive_file, ConfirmCallback};
use serde_json::json;
use std::fs;
use std::path::Path;

pub async fn execute_write_file(
    args: serde_json::Value,
    workspace_dir: &Path,
    on_confirm: &Option<ConfirmCallback>,
) -> String {
    let raw_path = match args.get("path").and_then(|v| v.as_str()) {
        Some(p) if !p.trim().is_empty() => p.trim(),
        _ => {
            return json!({ "error": "The 'path' argument is required and must be a valid string." })
                .to_string();
        }
    };

    let content = match args.get("content").and_then(|v| v.as_str()) {
        Some(c) => c,
        None => {
            return json!({ "error": "The 'content' argument is required and must be a string." })
                .to_string();
        }
    };

    let overwrite = args.get("overwrite").and_then(|v| v.as_bool()).unwrap_or(true);

    let resolved_path = workspace_dir.join(raw_path);

    if !is_path_inside(workspace_dir, &resolved_path) {
        return json!({
            "error": format!("Access denied: Path '{}' is outside the allowed workspace.", raw_path)
        })
        .to_string();
    }

    if is_sensitive_file(raw_path, workspace_dir) {
        let allowed = match on_confirm {
            Some(cb) => cb(&format!("write sensitive file '{}'", raw_path)).await,
            None => false,
        };

        if !allowed {
            return json!({
                "error": format!("Access denied: Writing to sensitive file '{}' was denied.", raw_path)
            })
            .to_string();
        }
    }

    if let Ok(meta) = fs::symlink_metadata(&resolved_path) {
        if meta.file_type().is_symlink() {
            return json!({
                "error": format!("Access denied: Writing to or overwriting symbolic links is prohibited. '{}' is a symbolic link.", raw_path)
            })
            .to_string();
        }
    }

    if resolved_path.exists() {
        if let Ok(meta) = fs::metadata(&resolved_path) {
            if meta.is_dir() {
                return json!({
                    "error": format!("'{}' is an existing directory, cannot write as a file.", raw_path)
                })
                .to_string();
            }
        }

        if !overwrite {
            return json!({
                "error": format!("File '{}' already exists and overwrite=false. File was not modified.", raw_path)
            })
            .to_string();
        }
    }

    if let Some(parent) = resolved_path.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return json!({
                    "error": format!("Failed to create parent directories for '{}': {}", raw_path, e)
                })
                .to_string();
            }
        }
    }

    if let Err(e) = fs::write(&resolved_path, content) {
        return json!({
            "error": format!("Error writing file '{}': {}", raw_path, e)
        })
        .to_string();
    }

    let lines = content.lines().count();
    let bytes = content.as_bytes().len();

    json!({
        "file": raw_path,
        "success": true,
        "written_bytes": bytes,
        "lines": lines,
        "message": format!("File '{}' saved successfully ({} bytes, {} lines).", raw_path, bytes, lines)
    })
    .to_string()
}
