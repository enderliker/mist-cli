use mist_cli::config::{
    resolve_config_from_map, CODESTRAL_API_ENDPOINT, DEFAULT_MODEL, MISTRAL_API_ENDPOINT,
};
use std::collections::HashMap;

#[test]
fn test_resolve_config_with_mistral_api_key() {
    let mut env = HashMap::new();
    env.insert(
        "MISTRAL_API_KEY".to_string(),
        "mistral-secret-123".to_string(),
    );

    let config = resolve_config_from_map(&env).expect("resolves config");
    assert_eq!(config.api_key, "mistral-secret-123");
    assert_eq!(config.server_url, MISTRAL_API_ENDPOINT);
    assert_eq!(config.model, DEFAULT_MODEL);
}

#[test]
fn test_resolve_config_with_codestral_api_key() {
    let mut env = HashMap::new();
    env.insert(
        "CODESTRAL_API_KEY".to_string(),
        "codestral-secret-456".to_string(),
    );

    let config = resolve_config_from_map(&env).expect("resolves config");
    assert_eq!(config.api_key, "codestral-secret-456");
    assert_eq!(config.server_url, CODESTRAL_API_ENDPOINT);
    assert_eq!(config.model, DEFAULT_MODEL);
}

#[test]
fn test_resolve_config_with_custom_overrides() {
    let mut env = HashMap::new();
    env.insert("MISTRAL_API_KEY".to_string(), "key-abc".to_string());
    env.insert(
        "MISTRAL_BASE_URL".to_string(),
        "https://custom.endpoint.com".to_string(),
    );
    env.insert("MISTRAL_MODEL".to_string(), "codestral-2501".to_string());

    let config = resolve_config_from_map(&env).expect("resolves config");
    assert_eq!(config.api_key, "key-abc");
    assert_eq!(config.server_url, "https://custom.endpoint.com");
    assert_eq!(config.model, "codestral-2501");
}

#[test]
fn test_resolve_config_missing_keys_fails() {
    let env = HashMap::new();
    let result = resolve_config_from_map(&env);
    assert!(result.is_err());
    let err_msg = result.err().unwrap().to_string();
    assert!(err_msg.contains("No valid API key found"));
}
