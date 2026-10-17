use crate::error::MistralError;
use crate::models::{ChatCompletionRequest, ChatCompletionResponse};
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use std::time::Duration;

pub const DEFAULT_MODEL: &str = "codestral-latest";
pub const MISTRAL_API_ENDPOINT: &str = "https://api.mistral.ai";
pub const CODESTRAL_API_ENDPOINT: &str = "https://codestral.mistral.ai";

#[derive(Clone, Debug)]
pub struct MistralClient {
    api_key: String,
    server_url: String,
    timeout: Option<Duration>,
    http_client: reqwest::Client,
}

impl MistralClient {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            server_url: MISTRAL_API_ENDPOINT.to_string(),
            timeout: None,
            http_client: reqwest::Client::new(),
        }
    }

    pub fn with_server_url(mut self, server_url: impl Into<String>) -> Self {
        let mut url = server_url.into();
        if url.ends_with('/') {
            url.pop();
        }
        self.server_url = url;
        self
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    pub fn api_key(&self) -> &str {
        &self.api_key
    }

    pub fn server_url(&self) -> &str {
        &self.server_url
    }

    pub fn timeout(&self) -> Option<Duration> {
        self.timeout
    }

    pub fn chat(&self) -> ChatClient {
        ChatClient {
            client: self.clone(),
        }
    }
}

pub struct ChatClient {
    client: MistralClient,
}

impl ChatClient {
    pub async fn complete(
        &self,
        request: &ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, MistralError> {
        let url = format!("{}/v1/chat/completions", self.client.server_url());

        let mut req_builder = self
            .client
            .http_client
            .post(&url)
            .header(CONTENT_TYPE, "application/json")
            .header(ACCEPT, "application/json")
            .header(AUTHORIZATION, format!("Bearer {}", self.client.api_key()))
            .json(request);

        if let Some(timeout) = self.client.timeout() {
            req_builder = req_builder.timeout(timeout);
        }

        let resp = req_builder.send().await?;
        let status = resp.status();

        if !status.is_success() {
            let error_text = resp.text().await.unwrap_or_default();
            let parsed_message = serde_json::from_str::<serde_json::Value>(&error_text)
                .ok()
                .and_then(|v| {
                    v.get("message")
                        .and_then(|m| m.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| {
                            v.get("error").and_then(|e| {
                                e.as_str()
                                    .map(|s| s.to_string())
                                    .or_else(|| {
                                        e.get("message")
                                            .and_then(|m| m.as_str())
                                            .map(|s| s.to_string())
                                    })
                            })
                        })
                })
                .unwrap_or(error_text);

            return Err(MistralError::Api {
                status_code: status.as_u16(),
                message: parsed_message,
            });
        }

        let body = resp.json::<ChatCompletionResponse>().await?;
        Ok(body)
    }
}
