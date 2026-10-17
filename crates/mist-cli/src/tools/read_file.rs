use super::types::{is_path_inside, is_sensitive_file, ConfirmCallback};
use serde_json::json;
use std::fs;
use std::io::{BufRead, BufReader};
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

    let start_line = args
        .get("start_line")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize);
    let end_line = args
        .get("end_line")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize);

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

    let file = match fs::File::open(&resolved_path) {
        Ok(f) => f,
        Err(e) => {
            return json!({ "error": format!("Failed to open file '{}': {}", raw_path, e) })
                .to_string();
        }
    };

    let reader = BufReader::new(file);
    let mut selected_lines = Vec::new();
    let mut selected_bytes = 0usize;
    let mut total_lines = 0usize;
    let mut actual_start = 1usize;
    let mut actual_end = 0usize;

    let target_start = start_line.unwrap_or(1).max(1);
    let target_end = end_line;

    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(e) => {
                return json!({ "error": format!("Failed to read line {} of '{}': {}", total_lines + 1, raw_path, e) })
                    .to_string();
            }
        };
        total_lines += 1;

        let in_range = total_lines >= target_start && target_end.is_none_or(|end| total_lines <= end);

        if in_range {
            if selected_lines.is_empty() {
                actual_start = total_lines;
            }
            actual_end = total_lines;

            if selected_bytes + line.len() > MAX_FILE_SIZE_BYTES as usize {
                selected_lines.push(format!("[Output truncated: exceeded {} KB limit]", MAX_FILE_SIZE_BYTES / 1024));
                break;
            }
            selected_bytes += line.len() + 1;
            selected_lines.push(line);
        }
    }

    if total_lines == 0 {
        actual_start = 1;
        actual_end = 0;
    } else if selected_lines.is_empty() {
        actual_start = target_start;
        actual_end = target_end.unwrap_or(target_start);
    }

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
