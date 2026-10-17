use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use thiserror::Error;

pub const DEFAULT_TIMEOUT_MS: u64 = 30_000;
pub const MAX_OUTPUT_BYTES: usize = 50 * 1024;

#[derive(Error, Debug)]
pub enum SandboxError {
    #[error("Sandbox engine 'bwrap' is not available or functional on this system.")]
    BubblewrapNotAvailable,

    #[error("Invalid workspace directory: {0}")]
    InvalidWorkspace(String),

    #[error("Execution failed: {0}")]
    ExecutionFailed(String),

    #[error("Command execution timed out after {0} ms")]
    Timeout(u64),
}

#[derive(Clone, Debug)]
pub struct BubblewrapOptions {
    pub workspace_dir: PathBuf,
    pub allow_network: bool,
    pub allow_env_secrets: bool,
    pub timeout_ms: Option<u64>,
    pub max_output_bytes: Option<usize>,
    pub extra_read_only_paths: Vec<PathBuf>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExecutionResult {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub stdout_truncated: bool,
    pub stderr_truncated: bool,
    pub truncated: bool,
    pub timed_out: bool,
    pub sandboxed: bool,
    pub engine: &'static str,
}

pub fn find_bubblewrap_binary() -> Option<PathBuf> {
    if !cfg!(target_os = "linux") {
        return None;
    }

    let candidates = ["/usr/bin/bwrap", "/bin/bwrap", "/usr/local/bin/bwrap"];
    for cand in candidates {
        let p = Path::new(cand);
        if p.is_file() {
            return Some(p.to_path_buf());
        }
    }

    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let candidate = dir.join("bwrap");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    None
}

pub fn is_bubblewrap_available(custom_binary_path: Option<&Path>) -> bool {
    if !cfg!(target_os = "linux") {
        return false;
    }

    let bin = match custom_binary_path {
        Some(p) => p.to_path_buf(),
        None => match find_bubblewrap_binary() {
            Some(p) => p,
            None => return false,
        },
    };

    let status = Command::new(&bin)
        .args(["--ro-bind", "/", "/", "true"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    matches!(status, Ok(s) if s.success())
}

pub fn validate_workspace_dir(workspace_dir: &Path) -> Result<PathBuf, SandboxError> {
    let resolved = if workspace_dir.is_relative() {
        std::env::current_dir()
            .map_err(|e| SandboxError::InvalidWorkspace(e.to_string()))?
            .join(workspace_dir)
    } else {
        workspace_dir.to_path_buf()
    };

    let real_path = fs::canonicalize(&resolved)
        .map_err(|e| SandboxError::InvalidWorkspace(format!("{}: {}", resolved.display(), e)))?;

    if !real_path.is_dir() {
        return Err(SandboxError::InvalidWorkspace(format!(
            "'{}' is not a directory.",
            real_path.display()
        )));
    }

    if real_path == Path::new("/") || real_path == Path::new("/root") {
        return Err(SandboxError::InvalidWorkspace(format!(
            "Refusing to mount '{}' as workspace: mounting the system root is forbidden for security.",
            real_path.display()
        )));
    }

    if let Ok(home_str) = std::env::var("HOME") {
        if let Ok(real_home) = fs::canonicalize(Path::new(&home_str)) {
            if real_path == real_home {
                return Err(SandboxError::InvalidWorkspace(format!(
                    "Refusing to mount '{}' as workspace: mounting the entire user home directory is forbidden for security.",
                    real_path.display()
                )));
            }
        }
    }

    Ok(real_path)
}

pub fn build_bubblewrap_args(
    command: &str,
    options: &BubblewrapOptions,
) -> Result<Vec<String>, SandboxError> {
    let real_workspace = validate_workspace_dir(&options.workspace_dir)?;
    let allow_network = options.allow_network;

    let mut args: Vec<String> = Vec::new();

    args.push("--new-session".to_string());

    for sys_path in ["/usr", "/lib", "/lib64", "/bin"] {
        if Path::new(sys_path).exists() {
            args.push("--ro-bind".to_string());
            args.push(sys_path.to_string());
            args.push(sys_path.to_string());
        }
    }

    for extra in &options.extra_read_only_paths {
        if extra.exists() {
            args.push("--ro-bind".to_string());
            args.push(extra.to_string_lossy().to_string());
            args.push(extra.to_string_lossy().to_string());
        }
    }

    let etc_files = [
        "/etc/resolv.conf",
        "/etc/hosts",
        "/etc/nsswitch.conf",
        "/etc/passwd",
        "/etc/group",
        "/etc/ssl",
        "/etc/pki",
        "/etc/alternatives",
    ];

    for etc in etc_files {
        if Path::new(etc).exists() {
            args.push("--ro-bind".to_string());
            args.push(etc.to_string());
            args.push(etc.to_string());
        }
    }

    args.push("--proc".to_string());
    args.push("/proc".to_string());
    args.push("--dev".to_string());
    args.push("/dev".to_string());
    args.push("--tmpfs".to_string());
    args.push("/tmp".to_string());
    args.push("--dir".to_string());
    args.push("/tmp/home".to_string());

    let ws_str = real_workspace.to_string_lossy().to_string();
    args.push("--bind".to_string());
    args.push(ws_str.clone());
    args.push(ws_str.clone());
    args.push("--chdir".to_string());
    args.push(ws_str);

    for git_sub in [".git/hooks", ".git/config"] {
        let p = real_workspace.join(git_sub);
        if p.exists() {
            args.push("--ro-bind".to_string());
            args.push(p.to_string_lossy().to_string());
            args.push(p.to_string_lossy().to_string());
        }
    }

    if !options.allow_env_secrets {
        let env_file = real_workspace.join(".env");
        if env_file.exists() {
            args.push("--ro-bind".to_string());
            args.push("/dev/null".to_string());
            args.push(env_file.to_string_lossy().to_string());
        }
    }

    args.push("--unshare-all".to_string());
    if allow_network {
        args.push("--share-net".to_string());
    }

    args.push("--clearenv".to_string());

    let mut path_dirs = vec!["/usr/local/bin", "/usr/bin", "/bin"];
    path_dirs.retain(|d| Path::new(d).exists());
    let final_path = path_dirs.join(":");

    args.push("--setenv".to_string());
    args.push("PATH".to_string());
    args.push(final_path);

    args.push("--setenv".to_string());
    args.push("HOME".to_string());
    args.push("/tmp/home".to_string());

    args.push("--setenv".to_string());
    args.push("TERM".to_string());
    args.push("xterm-256color".to_string());

    args.push("--die-with-parent".to_string());

    let limited_command = format!(
        "ulimit -u 512 2>/dev/null || true; ulimit -v 4194304 2>/dev/null || true; ulimit -n 4096 2>/dev/null || true; {}",
        command
    );

    args.push("--".to_string());
    args.push("/bin/sh".to_string());
    args.push("-c".to_string());
    args.push(limited_command);

    Ok(args)
}

pub fn run_in_bubblewrap(
    command: &str,
    options: &BubblewrapOptions,
    custom_bwrap_path: Option<&Path>,
) -> Result<ExecutionResult, SandboxError> {
    let bwrap_bin = custom_bwrap_path
        .map(|p| p.to_path_buf())
        .or_else(find_bubblewrap_binary)
        .ok_or(SandboxError::BubblewrapNotAvailable)?;

    if !is_bubblewrap_available(Some(&bwrap_bin)) {
        return Err(SandboxError::BubblewrapNotAvailable);
    }

    let args = build_bubblewrap_args(command, options)?;
    let max_bytes = options.max_output_bytes.unwrap_or(MAX_OUTPUT_BYTES);

    let output = Command::new(&bwrap_bin)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| SandboxError::ExecutionFailed(e.to_string()))?;

    let stdout_bytes = &output.stdout;
    let stderr_bytes = &output.stderr;

    let (stdout_slice, stdout_truncated) = if stdout_bytes.len() > max_bytes {
        (&stdout_bytes[..max_bytes], true)
    } else {
        (stdout_bytes.as_slice(), false)
    };

    let (stderr_slice, stderr_truncated) = if stderr_bytes.len() > max_bytes {
        (&stderr_bytes[..max_bytes], true)
    } else {
        (stderr_bytes.as_slice(), false)
    };

    let stdout = String::from_utf8_lossy(stdout_slice).to_string();
    let stderr = String::from_utf8_lossy(stderr_slice).to_string();

    Ok(ExecutionResult {
        exit_code: output.status.code(),
        stdout,
        stderr,
        stdout_truncated,
        stderr_truncated,
        truncated: stdout_truncated || stderr_truncated,
        timed_out: false,
        sandboxed: true,
        engine: "bubblewrap",
    })
}
