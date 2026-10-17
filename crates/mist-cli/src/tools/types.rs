use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use std::sync::Arc;

pub type ConfirmCallback =
    Arc<dyn Fn(&str) -> Pin<Box<dyn Future<Output = bool> + Send>> + Send + Sync>;

pub fn is_path_inside(base_dir: &Path, target_path: &Path) -> bool {
    let base_canonical = match std::fs::canonicalize(base_dir) {
        Ok(p) => p,
        Err(_) => base_dir.to_path_buf(),
    };

    let target_resolved = if target_path.is_relative() {
        base_dir.join(target_path)
    } else {
        target_path.to_path_buf()
    };

    if let Ok(target_canonical) = std::fs::canonicalize(&target_resolved) {
        target_canonical.starts_with(&base_canonical)
    } else {
        // If target doesn't exist yet, check its closest existing parent
        let mut curr = target_resolved.as_path();
        while let Some(parent) = curr.parent() {
            if parent.exists() {
                if let Ok(parent_canonical) = std::fs::canonicalize(parent) {
                    return parent_canonical.starts_with(&base_canonical);
                }
                break;
            }
            curr = parent;
        }
        false
    }
}

pub fn is_sensitive_file(file_path: &str, workspace_dir: &Path) -> bool {
    let p = Path::new(file_path);
    let file_name = match p.file_name().and_then(|f| f.to_str()) {
        Some(name) => name.to_lowercase(),
        None => return false,
    };

    if file_name == ".env" || file_name.starts_with(".env.") {
        return true;
    }
    if file_name.ends_with(".pem") || file_name.ends_with(".key") || file_name.starts_with("id_rsa")
    {
        return true;
    }

    let resolved = workspace_dir.join(file_path);
    if resolved.exists() {
        if let Ok(real) = std::fs::canonicalize(&resolved) {
            if let Some(real_name) = real.file_name().and_then(|f| f.to_str()) {
                let lower = real_name.to_lowercase();
                if lower == ".env" || lower.starts_with(".env.") {
                    return true;
                }
                if lower.ends_with(".pem") || lower.ends_with(".key") || lower.starts_with("id_rsa")
                {
                    return true;
                }
            }
        }
    }

    false
}

