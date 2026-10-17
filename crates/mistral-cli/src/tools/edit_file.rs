use super::types::{is_path_inside, is_sensitive_file, ConfirmCallback};
use serde_json::json;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

fn count_occurrences(content: &str, substring: &str) -> usize {
    if substring.is_empty() {
        return 0;
    }
    content.matches(substring).count()
}

pub async fn execute_edit_file(
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

    let target_content = match args.get("target_content").and_then(|v| v.as_str()) {
        Some(tc) => tc,
        None => {
            return json!({ "error": "Missing required argument 'target_content'." }).to_string();
        }
    };

    let replacement_content = match args.get("replacement_content").and_then(|v| v.as_str()) {
        Some(rc) => rc,
        None => {
            return json!({ "error": "Missing required argument 'replacement_content'." })
                .to_string();
        }
    };

    let expected_matches = args
        .get("expected_matches")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize)
        .unwrap_or(1)
        .max(1);

    let resolved_path = workspace_dir.join(raw_path);

    if !is_path_inside(workspace_dir, &resolved_path) {
        return json!({
            "error": format!("Access denied: Target path '{}' is outside the allowed workspace.", raw_path)
        })
        .to_string();
    }

    if !resolved_path.exists() {
        return json!({
            "error": format!("File '{}' does not exist. Use 'write_file' to create new files.", raw_path)
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

    if metadata.is_dir() {
        return json!({ "error": format!("'{}' is a directory, not a file.", raw_path) })
            .to_string();
    }

    if is_sensitive_file(raw_path, workspace_dir) {
        let allowed = match on_confirm {
            Some(cb) => cb(&format!("edit sensitive file '{}'", raw_path)).await,
            None => false,
        };

        if !allowed {
            return json!({
                "error": format!("Access denied: Editing sensitive file '{}' was denied.", raw_path)
            })
            .to_string();
        }
    }

    let original_content = match fs::read_to_string(&resolved_path) {
        Ok(c) => c,
        Err(e) => {
            return json!({ "error": format!("Failed to read '{}': {}", raw_path, e) }).to_string();
        }
    };

    let actual_occurrences = count_occurrences(&original_content, target_content);

    if actual_occurrences == 0 {
        return json!({
            "error": format!("Target content not found in '{}'. Verify exact characters, line breaks, and indentation using 'read_file'.", raw_path)
        })
        .to_string();
    }

    if actual_occurrences != expected_matches {
        return json!({
            "error": format!("Ambiguous match: Target content was found {} time(s) in '{}', but expected exactly {}. Provide more surrounding context lines to ensure a unique match.", actual_occurrences, raw_path, expected_matches)
        })
        .to_string();
    }

    let new_content = if expected_matches == 1 {
        if let Some(idx) = original_content.find(target_content) {
            let mut res = String::with_capacity(
                original_content.len() - target_content.len() + replacement_content.len(),
            );
            res.push_str(&original_content[..idx]);
            res.push_str(replacement_content);
            res.push_str(&original_content[idx + target_content.len()..]);
            res
        } else {
            original_content.clone()
        }
    } else {
        original_content.replace(target_content, replacement_content)
    };

    let now_nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let temp_file = format!("{}.tmp.{}", resolved_path.display(), now_nanos);

    if let Err(e) = fs::write(&temp_file, &new_content) {
        return json!({ "error": format!("Failed to write updates to '{}': {}", raw_path, e) })
            .to_string();
    }

    if let Err(e) = fs::rename(&temp_file, &resolved_path) {
        let _ = fs::remove_file(&temp_file);
        return json!({ "error": format!("Failed to write updates to '{}': {}", raw_path, e) })
            .to_string();
    }

    json!({
        "success": true,
        "path": raw_path,
        "replacements": actual_occurrences,
        "message": format!("Successfully replaced {} occurrence(s) in '{}'.", actual_occurrences, raw_path)
    })
    .to_string()
}
