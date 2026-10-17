use thiserror::Error;

#[derive(Error, Debug)]
pub enum MistralError {
    #[error("API error (status {status_code}): {message}")]
    Api { status_code: u16, message: String },

    #[error("HTTP transport error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("JSON serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}
