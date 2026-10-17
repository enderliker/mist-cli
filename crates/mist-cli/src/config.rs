use std::collections::HashMap;
use thiserror::Error;

pub const DEFAULT_MODEL: &str = "codestral-latest";
pub const MISTRAL_API_ENDPOINT: &str = "https://api.mistral.ai";
pub const CODESTRAL_API_ENDPOINT: &str = "https://codestral.mistral.ai";

#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("No valid API key found. Please define MISTRAL_API_KEY or CODESTRAL_API_KEY in your environment or in a .env file.")]
    MissingApiKey,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MistralCliConfig {
    pub api_key: String,
    pub server_url: String,
    pub model: String,
}

pub fn resolve_config_from_map(
    env: &HashMap<String, String>,
) -> Result<MistralCliConfig, ConfigError> {
    let mistral_key = env
        .get("MISTRAL_API_KEY")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let codestral_key = env
        .get("CODESTRAL_API_KEY")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let custom_base_url = env
        .get("MISTRAL_BASE_URL")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let custom_model = env
        .get("MISTRAL_MODEL")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    if mistral_key.is_none() && codestral_key.is_none() {
        return Err(ConfigError::MissingApiKey);
    }

    let (api_key, server_url) = if let Some(m_key) = mistral_key {
        let url = custom_base_url.unwrap_or(MISTRAL_API_ENDPOINT);
        (m_key.to_string(), url.to_string())
    } else {
        let c_key = codestral_key.unwrap();
        let url = custom_base_url.unwrap_or(CODESTRAL_API_ENDPOINT);
        (c_key.to_string(), url.to_string())
    };

    let model = custom_model.unwrap_or(DEFAULT_MODEL).to_string();

    Ok(MistralCliConfig {
        api_key,
        server_url,
        model,
    })
}

pub fn resolve_config() -> Result<MistralCliConfig, ConfigError> {
    let _ = dotenvy::dotenv();
    let env_map: HashMap<String, String> = std::env::vars().collect();
    resolve_config_from_map(&env_map)
}
