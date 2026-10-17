use super::sandbox::bubblewrap::{
    is_bubblewrap_available, run_in_bubblewrap, BubblewrapOptions,
};
use super::types::ConfirmCallback;
use serde_json::json;
use std::path::Path;

pub async fn execute_execute_command(
    args: serde_json::Value,
    workspace_dir: &Path,
    on_confirm: &Option<ConfirmCallback>,
) -> String {
    let command = match args.get("command").and_then(|v| v.as_str()) {
        Some(cmd) if !cmd.trim().is_empty() => cmd.trim(),
        _ => {
            return json!({
                "error": "The 'command' argument is required and must be a valid non-empty string."
            })
            .to_string();
        }
    };

    if !is_bubblewrap_available(None) {
        return json!({
            "error": "Bubblewrap sandbox engine ('bwrap') is not available or functional on this system (requires Linux with user namespace support). Command execution is blocked to fail closed."
        })
        .to_string();
    }

    if on_confirm.is_none() {
        return json!({
            "error": format!("Execution denied: Command '{}' requires explicit user confirmation.", command)
        })
        .to_string();
    }

    let allowed = match on_confirm {
        Some(cb) => cb(&format!("execute sandboxed command '{}'", command)).await,
        None => false,
    };

    if !allowed {
        return json!({
            "error": format!("Execution cancelled: The user denied permission to execute command '{}'.", command)
        })
        .to_string();
    }

    let timeout_seconds = args
        .get("timeout_seconds")
        .and_then(|v| v.as_u64())
        .unwrap_or(30)
        .clamp(1, 120);

    let allow_network = args
        .get("allow_network")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let allow_env_secrets = args
        .get("allow_env_secrets")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let options = BubblewrapOptions {
        workspace_dir: workspace_dir.to_path_buf(),
        allow_network,
        allow_env_secrets,
        timeout_ms: Some(timeout_seconds * 1000),
        max_output_bytes: None,
        extra_read_only_paths: Vec::new(),
    };

    match run_in_bubblewrap(command, &options, None) {
        Ok(result) => json!({
            "command": command,
            "exit_code": result.exit_code,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "timed_out": result.timed_out,
            "truncated": result.truncated,
            "sandboxed": result.sandboxed,
            "engine": result.engine,
        })
        .to_string(),
        Err(e) => json!({
            "error": format!("Sandbox execution failed: {}", e)
        })
        .to_string(),
    }
}
