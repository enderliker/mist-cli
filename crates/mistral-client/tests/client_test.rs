use mistral_client::{MistralClient, CODESTRAL_API_ENDPOINT, DEFAULT_MODEL, MISTRAL_API_ENDPOINT};
use std::time::Duration;

#[test]
fn test_client_default_configuration() {
    let client = MistralClient::new("test-api-key");
    assert_eq!(client.api_key(), "test-api-key");
    assert_eq!(client.server_url(), MISTRAL_API_ENDPOINT);
    assert_eq!(DEFAULT_MODEL, "codestral-latest");
}

#[test]
fn test_client_custom_server_url_and_timeout() {
    let client = MistralClient::new("codestral-key")
        .with_server_url(CODESTRAL_API_ENDPOINT)
        .with_timeout(Duration::from_secs(45));

    assert_eq!(client.api_key(), "codestral-key");
    assert_eq!(client.server_url(), CODESTRAL_API_ENDPOINT);
    assert_eq!(client.timeout(), Some(Duration::from_secs(45)));
}
