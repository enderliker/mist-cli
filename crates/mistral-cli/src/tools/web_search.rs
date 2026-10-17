use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;

pub const DEFAULT_TAVILY_SEARCH_ENDPOINT: &str = "https://api.tavily.com/search";

#[derive(Deserialize, Serialize, Debug)]
pub struct TavilySearchResultItem {
    pub title: String,
    pub url: String,
    pub content: String,
    pub score: Option<f64>,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct TavilySearchResponse {
    pub query: Option<String>,
    pub answer: Option<String>,
    #[serde(default)]
    pub results: Vec<TavilySearchResultItem>,
}

pub async fn execute_web_search(
    args: serde_json::Value,
    api_key_override: Option<&str>,
    endpoint_override: Option<&str>,
) -> String {
    let query = match args.get("query").and_then(|v| v.as_str()) {
        Some(q) if !q.trim().is_empty() => q.trim(),
        _ => {
            return json!({ "error": "Missing required argument 'query'." }).to_string();
        }
    };

    let api_key = match api_key_override {
        Some(k) if !k.trim().is_empty() => k.trim().to_string(),
        _ => match std::env::var("TAVILY_API_KEY") {
            Ok(k) if !k.trim().is_empty() => k.trim().to_string(),
            _ => {
                return json!({
                    "error": "TAVILY_API_KEY is not configured. Please define TAVILY_API_KEY in your environment or .env file to enable web search (get a key at https://tavily.com)."
                })
                .to_string();
            }
        },
    };

    let max_results = args
        .get("max_results")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize)
        .unwrap_or(5)
        .clamp(1, 10);

    let search_depth = args
        .get("search_depth")
        .and_then(|v| v.as_str())
        .map(|s| if s == "basic" { "basic" } else { "advanced" })
        .unwrap_or("advanced");

    let include_answer = args
        .get("include_answer")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let mut payload = json!({
        "api_key": api_key,
        "query": query,
        "search_depth": search_depth,
        "include_answer": include_answer,
        "max_results": max_results,
    });

    if let Some(domains) = args.get("include_domains").and_then(|v| v.as_array()) {
        let domain_strings: Vec<&str> = domains.iter().filter_map(|d| d.as_str()).collect();
        if !domain_strings.is_empty() {
            payload["include_domains"] = json!(domain_strings);
        }
    }

    let endpoint = endpoint_override.unwrap_or(DEFAULT_TAVILY_SEARCH_ENDPOINT);

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return json!({ "error": format!("Failed to create HTTP client: {}", e) }).to_string();
        }
    };

    let response = match client
        .post(endpoint)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return json!({
                "error": format!("Network failure or timeout while reaching Tavily search API: {}", e)
            })
            .to_string();
        }
    };

    let status = response.status();
    if !status.is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return json!({
            "error": format!("Tavily API search failed with HTTP status {}: {}", status, error_body)
        })
        .to_string();
    }

    let data: TavilySearchResponse = match response.json().await {
        Ok(d) => d,
        Err(e) => {
            return json!({
                "error": format!("Failed to parse Tavily API response: {}", e)
            })
            .to_string();
        }
    };

    let trimmed_results: Vec<serde_json::Value> = data
        .results
        .into_iter()
        .map(|r| {
            let snippet = if r.content.len() > 1000 {
                let mut truncated: String = r.content.chars().take(1000).collect();
                truncated.push_str("...");
                truncated
            } else {
                r.content
            };
            json!({
                "title": r.title,
                "url": r.url,
                "snippet": snippet,
                "score": r.score
            })
        })
        .collect();

    json!({
        "query": data.query.unwrap_or_else(|| query.to_string()),
        "answer": data.answer,
        "results_count": trimmed_results.len(),
        "results": trimmed_results
    })
    .to_string()
}
