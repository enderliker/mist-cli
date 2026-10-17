use mist_cli::tools::sandbox::bubblewrap::{
    build_bubblewrap_args, is_bubblewrap_available, run_in_bubblewrap, BubblewrapOptions,
};
use tempfile::tempdir;

#[test]
fn test_build_bubblewrap_args_contain_security_flags() {
    let tmp = tempdir().expect("create temp dir");
    let options = BubblewrapOptions {
        workspace_dir: tmp.path().to_path_buf(),
        allow_network: false,
        allow_env_secrets: false,
        timeout_ms: Some(5000),
        max_output_bytes: Some(1024),
        extra_read_only_paths: vec![],
    };

    let args = build_bubblewrap_args("echo 'test'", &options).expect("build args");

    assert!(args.contains(&"--unshare-all".to_string()));
    assert!(!args.contains(&"--share-net".to_string()));
    assert!(args.contains(&"--tmpfs".to_string()));
    assert!(args.contains(&"/tmp".to_string()));
    assert!(args.contains(&"--bind".to_string()));
    assert!(args.contains(&"--new-session".to_string()));
    assert!(args.contains(&"--clearenv".to_string()));
}

#[test]
fn test_build_bubblewrap_args_allow_network_shares_net() {
    let tmp = tempdir().expect("create temp dir");
    let options = BubblewrapOptions {
        workspace_dir: tmp.path().to_path_buf(),
        allow_network: true,
        allow_env_secrets: false,
        timeout_ms: None,
        max_output_bytes: None,
        extra_read_only_paths: vec![],
    };

    let args = build_bubblewrap_args("curl example.com", &options).expect("build args");

    assert!(args.contains(&"--unshare-all".to_string()));
    assert!(args.contains(&"--share-net".to_string()));
}

#[test]
fn test_validate_workspace_dir_refuses_root() {
    let options = BubblewrapOptions {
        workspace_dir: std::path::PathBuf::from("/"),
        allow_network: false,
        allow_env_secrets: false,
        timeout_ms: None,
        max_output_bytes: None,
        extra_read_only_paths: vec![],
    };

    let result = build_bubblewrap_args("ls", &options);
    assert!(result.is_err());
    let err = result.err().unwrap().to_string();
    assert!(err.contains("mounting the system root is forbidden"));
}

#[test]
fn test_run_in_bubblewrap_basic_command() {
    if !is_bubblewrap_available(None) {
        eprintln!("Bubblewrap not available on this environment, skipping execution test.");
        return;
    }

    let tmp = tempdir().expect("create temp dir");
    let options = BubblewrapOptions {
        workspace_dir: tmp.path().to_path_buf(),
        allow_network: false,
        allow_env_secrets: false,
        timeout_ms: Some(5000),
        max_output_bytes: Some(1024),
        extra_read_only_paths: vec![],
    };

    let result =
        run_in_bubblewrap("echo 'hello from bwrap'", &options, None).expect("runs in bubblewrap");

    assert_eq!(result.exit_code, Some(0));
    assert!(result.stdout.contains("hello from bwrap"));
    assert!(result.sandboxed);
    assert_eq!(result.engine, "bubblewrap");
}

#[test]
fn test_run_in_bubblewrap_timeout() {
    if !is_bubblewrap_available(None) {
        eprintln!("Bubblewrap not available on this environment, skipping timeout test.");
        return;
    }

    let tmp = tempdir().expect("create temp dir");
    let options = BubblewrapOptions {
        workspace_dir: tmp.path().to_path_buf(),
        allow_network: false,
        allow_env_secrets: false,
        timeout_ms: Some(100),
        max_output_bytes: Some(1024),
        extra_read_only_paths: vec![],
    };

    let result = run_in_bubblewrap("sleep 5", &options, None).expect("runs in bubblewrap");
    assert!(result.timed_out);
}

#[test]
fn test_build_bubblewrap_args_masks_sensitive_files() {
    let tmp = tempdir().expect("create temp dir");
    std::fs::write(tmp.path().join(".env.local"), "SECRET=xyz").unwrap();
    std::fs::write(tmp.path().join("id_rsa_backup"), "PRIVATE_KEY").unwrap();

    let options = BubblewrapOptions {
        workspace_dir: tmp.path().to_path_buf(),
        allow_network: false,
        allow_env_secrets: false,
        timeout_ms: None,
        max_output_bytes: None,
        extra_read_only_paths: vec![],
    };

    let args = build_bubblewrap_args("echo 1", &options).expect("build args");
    let dev_null_indices: Vec<usize> = args
        .iter()
        .enumerate()
        .filter(|(_, a)| *a == "/dev/null")
        .map(|(i, _)| i)
        .collect();

    // At least 2 sensitive files masked with /dev/null
    assert!(dev_null_indices.len() >= 2);
}
