use super::types::{is_path_inside, ConfirmCallback};
use regex::RegexBuilder;
use serde_json::json;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    ".gemini",
    ".codex",
    ".github",
    ".agents",
    "target",
    ".DS_Store",
];

const MAX_FILE_SIZE_BYTES: u64 = 200 * 1024;

fn matches_file_pattern(file_name: &str, pattern: Option<&str>) -> bool {
    let pattern = match pattern {
        Some(p) if !p.trim().is_empty() => p.trim().to_lowercase(),
        _ => return true,
    };
    let lower_name = file_name.to_lowercase();

    if let Some(ext) = pattern.strip_prefix("*.") {
        return lower_name.ends_with(&format!(".{}", ext));
    }

    if pattern.contains('*') {
        let regex_str = format!("^{}$", regex::escape(&pattern).replace(r"\*", ".*"));
        if let Ok(re) = regex::Regex::new(&regex_str) {
            return re.is_match(&lower_name);
        }
    }

    lower_name.contains(&pattern)
}

pub async fn execute_search_files(
    args: serde_json::Value,
    workspace_dir: &Path,
    _on_confirm: &Option<ConfirmCallback>,
) -> String {
    let pattern = match args.get("pattern").and_then(|v| v.as_str()) {
        Some(p) if !p.trim().is_empty() => p.trim(),
        _ => {
            return json!({ "error": "Missing required argument 'pattern'." }).to_string();
        }
    };

    let raw_path = args
        .get("path")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(".");

    let case_sensitive = args
        .get("case_sensitive")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let file_pattern = args.get("file_pattern").and_then(|v| v.as_str());

    let max_results = args
        .get("max_results")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize)
        .unwrap_or(50)
        .clamp(1, 100);

    let search_root = workspace_dir.join(raw_path);

    if !is_path_inside(workspace_dir, &search_root) {
        return json!({
            "error": format!("Access denied: Path '{}' is outside the allowed workspace.", raw_path)
        })
        .to_string();
    }

    if !search_root.exists() {
        return json!({
            "error": format!("Directory or path '{}' does not exist in the workspace.", raw_path)
        })
        .to_string();
    }

    let regex = match RegexBuilder::new(pattern)
        .case_insensitive(!case_sensitive)
        .build()
    {
        Ok(re) => re,
        Err(_) => {
            let escaped = regex::escape(pattern);
            match RegexBuilder::new(&escaped)
                .case_insensitive(!case_sensitive)
                .build()
            {
                Ok(re) => re,
                Err(e) => {
                    return json!({ "error": format!("Invalid search pattern: {}", e) })
                        .to_string();
                }
            }
        }
    };

    let ignored_set: HashSet<&str> = IGNORED_DIRS.iter().copied().collect();
    let mut matches = Vec::new();
    let mut truncated = false;

    let canonical_workspace =
        fs::canonicalize(workspace_dir).unwrap_or_else(|_| workspace_dir.to_path_buf());

    let metadata = match fs::metadata(&search_root) {
        Ok(m) => m,
        Err(e) => {
            return json!({ "error": format!("Failed to inspect path '{}': {}", raw_path, e) })
                .to_string();
        }
    };

    if metadata.is_file() {
        if let Ok(content) = fs::read_to_string(&search_root) {
            let rel_path = match search_root.strip_prefix(&canonical_workspace) {
                Ok(p) => p.to_string_lossy().to_string(),
                Err(_) => raw_path.to_string(),
            };

            for (i, line) in content.lines().enumerate() {
                if regex.is_match(line) {
                    let trimmed_text = line.trim();
                    let char_limit = trimmed_text.chars().take(300).collect::<String>();
                    matches.push(json!({
                        "file": rel_path,
                        "line": i + 1,
                        "text": char_limit
                    }));
                    if matches.len() >= max_results {
                        truncated = true;
                        break;
                    }
                }
            }
        }
    } else {
        #[allow(clippy::too_many_arguments)]
        fn walk(
            dir: &Path,
            workspace_root: &Path,
            ignored: &HashSet<&str>,
            file_pattern: Option<&str>,
            regex: &regex::Regex,
            max_results: usize,
            matches: &mut Vec<serde_json::Value>,
            truncated: &mut bool,
        ) {
            if matches.len() >= max_results {
                *truncated = true;
                return;
            }

            let rd = match fs::read_dir(dir) {
                Ok(rd) => rd,
                Err(_) => return,
            };

            for entry in rd.flatten() {
                if matches.len() >= max_results {
                    *truncated = true;
                    break;
                }

                let file_name_os = entry.file_name();
                let file_name = match file_name_os.to_str() {
                    Some(n) => n,
                    None => continue,
                };

                if ignored.contains(file_name) {
                    continue;
                }

                let path = entry.path();
                let file_type = match entry.file_type() {
                    Ok(ft) => ft,
                    Err(_) => continue,
                };

                if file_type.is_dir() {
                    walk(
                        &path,
                        workspace_root,
                        ignored,
                        file_pattern,
                        regex,
                        max_results,
                        matches,
                        truncated,
                    );
                } else if file_type.is_file() {
                    if !matches_file_pattern(file_name, file_pattern) {
                        continue;
                    }

                    if let Ok(meta) = entry.metadata() {
                        if meta.len() > MAX_FILE_SIZE_BYTES {
                            continue;
                        }
                    }

                    if let Ok(content) = fs::read_to_string(&path) {
                        let rel_path = match path.strip_prefix(workspace_root) {
                            Ok(p) => p.to_string_lossy().to_string(),
                            Err(_) => file_name.to_string(),
                        };

                        for (i, line) in content.lines().enumerate() {
                            if regex.is_match(line) {
                                let trimmed_text = line.trim();
                                let char_limit = trimmed_text.chars().take(300).collect::<String>();
                                matches.push(json!({
                                    "file": rel_path,
                                    "line": i + 1,
                                    "text": char_limit
                                }));
                                if matches.len() >= max_results {
                                    *truncated = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        walk(
            &search_root,
            &canonical_workspace,
            &ignored_set,
            file_pattern,
            &regex,
            max_results,
            &mut matches,
            &mut truncated,
        );
    }

    json!({
        "query": pattern,
        "matches_count": matches.len(),
        "truncated": truncated,
        "matches": matches
    })
    .to_string()
}
