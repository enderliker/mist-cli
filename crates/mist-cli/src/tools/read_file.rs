use super::types::{is_path_inside, is_sensitive_file, ConfirmCallback};
use serde_json::json;
use std::fs;
use std::path::Path;

pub const MAX_FILE_SIZE_BYTES: u64 = 100 * 1024;

pub async fn execute_read_file(
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

    let start_line = args.get("start_line").and_then(|v| v.as_u64()).map(|n| n as usize);
    let end_line = args.get("end_line").and_then(|v| v.as_u64()).map(|n| n as usize);

    let resolved_path = workspace_dir.join(raw_path);

    if !is_path_inside(workspace_dir, &resolved_path) {
        return json!({
            "error": format!("Access denied: Path '{}' is outside the allowed workspace.", raw_path)
        })
        .to_string();
    }

    if !resolved_path.exists() {
        return json!({
            "error": format!("File '{}' does not exist in the workspace.", raw_path)
        })
        .to_string();
    }

    if is_sensitive_file(raw_path, workspace_dir) {
        let allowed = match on_confirm {
            Some(cb) => cb(&format!("read sensitive file '{}'", raw_path)).await,
            None => false,
        };

        if !allowed {
            return json!({
                "error": format!("Access denied: Reading sensitive file '{}' was denied.", raw_path)
            })
            .to_string();
        }
    }

    let metadata = match fs::metadata(&resolved_path) {
        Ok(m) => m,
        Err(e) => {
            return json!({ "error": format!("Failed to read metadata for '{}': {}", raw_path, e) })
                .to_string();
        }
    };

    if metadata.is_dir() {
        return json!({ "error": format!("'{}' is a directory, not a text file.", raw_path) })
            .to_string();
    }

    if metadata.len() > MAX_FILE_SIZE_BYTES && start_line.is_none() && end_line.is_none() {
        return json!({
            "error": format!(
                "File '{}' is too large ({:.1} KB > {} KB). Specify 'start_line' and 'end_line' to read specific chunks.",
                raw_path,
                metadata.len() as f64 / 1024.0,
                MAX_FILE_SIZE_BYTES / 1024
            )
        })
        .to_string();
    }

    let content_str = match fs::read_to_string(&resolved_path) {
        Ok(c) => c,
        Err(e) => {
            return json!({ "error": format!("Failed to read file '{}': {}", raw_path, e) })
                .to_string();
        }
    };

    let all_lines: Vec<&str> = content_str.lines().collect();
    let total_lines = all_lines.len();

    let (selected_lines, actual_start, actual_end) = match (start_line, end_line) {
        (Some(start), Some(end)) => {
            let s = start.max(1).min(total_lines.max(1));
            let e = end.min(total_lines).max(s);
            if s > total_lines {
                (vec![], s, e)
            } else {
                (all_lines[(s - 1)..e].to_vec(), s, e)
            }
        }
        (Some(start), None) => {
            let s = start.max(1).min(total_lines.max(1));
            if s > total_lines {
                (vec![], s, total_lines)
            } else {
                (all_lines[(s - 1)..].to_vec(), s, total_lines)
            }
        }
        (None, Some(end)) => {
            let e = end.min(total_lines);
            (all_lines[..e].to_vec(), 1, e)
        }
        (None, None) => (all_lines, 1, total_lines),
    };

    let content = selected_lines.join("\n");
    let lines_read = selected_lines.len();

    json!({
        "file": raw_path,
        "total_lines": total_lines,
        "start_line": actual_start,
        "end_line": actual_end,
        "lines_read": lines_read,
        "content": content
    })
    .to_string()
}
