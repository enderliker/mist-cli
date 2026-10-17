use regex::Regex;
use serde_json::json;
use std::sync::LazyLock;
use std::time::Duration;

pub const DEFAULT_TAVILY_EXTRACT_ENDPOINT: &str = "https://api.tavily.com/extract";

static TITLE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<title[^>]*>([\s\S]*?)</title>").unwrap());

static REMOVE_TAG_REGEXES: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        Regex::new(r"(?is)<script\b[^>]*>.*?</script>").unwrap(),
        Regex::new(r"(?is)<style\b[^>]*>.*?</style>").unwrap(),
        Regex::new(r"(?is)<noscript\b[^>]*>.*?</noscript>").unwrap(),
        Regex::new(r"(?is)<svg\b[^>]*>.*?</svg>").unwrap(),
        Regex::new(r"(?is)<nav\b[^>]*>.*?</nav>").unwrap(),
        Regex::new(r"(?is)<header\b[^>]*>.*?</header>").unwrap(),
        Regex::new(r"(?is)<footer\b[^>]*>.*?</footer>").unwrap(),
    ]
});

static H1_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<h1[^>]*>([\s\S]*?)</h1>").unwrap());
static H2_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<h2[^>]*>([\s\S]*?)</h2>").unwrap());
static H3_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<h3[^>]*>([\s\S]*?)</h3>").unwrap());
static H46_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<h[4-6][^>]*>([\s\S]*?)</h[4-6]>").unwrap());
static LI_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<li[^>]*>([\s\S]*?)</li>").unwrap());
static P_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<p[^>]*>([\s\S]*?)</p>").unwrap());
static BR_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<br\s*/?>").unwrap());
static HR_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)<hr\s*/?>").unwrap());
static TAGS_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"<[^>]+>").unwrap());
static WS_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[ \t]+").unwrap());

pub fn clean_html_to_markdown(html: &str) -> String {
    let mut text = html.to_string();

    // Extract title if present
    let title = TITLE_REGEX
        .captures(&text)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().trim().to_string())
        .unwrap_or_default();

    // Remove head, scripts, styles, noscript, svg, nav, header, footer
    for re in REMOVE_TAG_REGEXES.iter() {
        text = re.replace_all(&text, " ").to_string();
    }

    // Headings
    text = H1_REGEX.replace_all(&text, "\n\n# $1\n\n").to_string();
    text = H2_REGEX.replace_all(&text, "\n\n## $1\n\n").to_string();
    text = H3_REGEX.replace_all(&text, "\n\n### $1\n\n").to_string();
    text = H46_REGEX.replace_all(&text, "\n\n#### $1\n\n").to_string();

    // List items and paragraphs
    text = LI_REGEX.replace_all(&text, "\n* $1").to_string();
    text = P_REGEX.replace_all(&text, "\n\n$1\n\n").to_string();
    text = BR_REGEX.replace_all(&text, "\n").to_string();
    text = HR_REGEX.replace_all(&text, "\n---\n").to_string();

    // Strip remaining HTML tags
    text = TAGS_REGEX.replace_all(&text, " ").to_string();

    // Decode HTML entities
    text = text
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&copy;", "©")
        .replace("&mdash;", "—")
        .replace("&ndash;", "–");

    // Normalize whitespace
    let mut normalized_lines = Vec::new();
    for line in text.lines() {
        let trimmed = WS_REGEX.replace_all(line, " ").trim().to_string();
        if !trimmed.is_empty() {
            normalized_lines.push(trimmed);
        }
    }
    let mut result = normalized_lines.join("\n\n");

    if !title.is_empty() && !result.starts_with("# ") {
        result = format!("# {}\n\n{}", title, result);
    }

    result
}

pub async fn execute_fetch_web_page(
    args: serde_json::Value,
    api_key_override: Option<&str>,
    extract_endpoint_override: Option<&str>,
) -> String {
    let raw_url = match args.get("url").and_then(|v| v.as_str()) {
        Some(u) if !u.trim().is_empty() => u.trim(),
        _ => {
            return json!({ "error": "Missing required argument 'url'." }).to_string();
        }
    };

    let parsed_url = match reqwest::Url::parse(raw_url) {
        Ok(u) => u,
        Err(e) => {
            return json!({ "error": format!("Invalid URL: {}", e) }).to_string();
        }
    };

    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return json!({
            "error": "Invalid URL protocol. Only http: and https: are allowed."
        })
        .to_string();
    }

    let allow_local = std::env::var("MIST_ALLOW_LOCAL_FETCH")
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);

    if !allow_local {
        if let Some(host) = parsed_url.host_str() {
            let host_lower = host.to_lowercase();
            if host_lower == "localhost"
                || host_lower.ends_with(".localhost")
                || host_lower.ends_with(".local")
                || host_lower == "metadata.google.internal"
            {
                return json!({
                    "error": "Access denied: Requesting localhost, local network, or cloud metadata endpoints is forbidden for security."
                })
                .to_string();
            }

            if let Ok(ip) = host.parse::<std::net::IpAddr>() {
                let is_blocked = match ip {
                    std::net::IpAddr::V4(ipv4) => {
                        ipv4.is_loopback()
                            || ipv4.is_private()
                            || ipv4.is_link_local()
                            || ipv4.is_broadcast()
                            || ipv4.is_unspecified()
                    }
                    std::net::IpAddr::V6(ipv6) => ipv6.is_loopback() || ipv6.is_unspecified(),
                };
                if is_blocked {
                    return json!({
                        "error": format!("Access denied: IP address '{}' is private or local and blocked for security.", ip)
                    })
                    .to_string();
                }
            }
        }
    }

    let max_length = args
        .get("max_length")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize)
        .unwrap_or(20_000)
        .clamp(500, 50_000);

    let api_key = match api_key_override {
        Some(k) if !k.trim().is_empty() => Some(k.trim().to_string()),
        _ => std::env::var("TAVILY_API_KEY")
            .ok()
            .filter(|k| !k.trim().is_empty()),
    };

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return json!({ "error": format!("Failed to create HTTP client: {}", e) }).to_string();
        }
    };

    // 1. Tavily extract if key present
    if let Some(key) = api_key {
        let endpoint = extract_endpoint_override.unwrap_or(DEFAULT_TAVILY_EXTRACT_ENDPOINT);
        let payload = json!({
            "api_key": key,
            "urls": [raw_url]
        });

        if let Ok(res) = client
            .post(endpoint)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
        {
            if res.status().is_success() {
                if let Ok(body) = res.json::<serde_json::Value>().await {
                    if let Some(first_res) = body.get("results").and_then(|r| r.get(0)) {
                        if let Some(raw_content) =
                            first_res.get("raw_content").and_then(|c| c.as_str())
                        {
                            let mut content = raw_content.trim().to_string();
                            let mut truncated = false;
                            if content.len() > max_length {
                                content = content.chars().take(max_length).collect();
                                content.push_str(&format!(
                                    "\n\n[Content truncated at {} characters]",
                                    max_length
                                ));
                                truncated = true;
                            }

                            return json!({
                                "url": raw_url,
                                "title": first_res.get("title").and_then(|t| t.as_str()),
                                "engine": "tavily_extract",
                                "length": content.len(),
                                "truncated": truncated,
                                "content": content
                            })
                            .to_string();
                        }
                    }
                }
            }
        }
    }

    // 2. Native fetch fallback
    let response = match client
        .get(raw_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .header(
            "Accept",
            "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        )
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return json!({ "error": format!("Network failure while fetching '{}': {}", raw_url, e) })
                .to_string();
        }
    };

    let status = response.status();
    if !status.is_success() {
        return json!({
            "error": format!("Failed to fetch URL with HTTP status {}.", status)
        })
        .to_string();
    }

    let html = match response.text().await {
        Ok(t) => t,
        Err(e) => {
            return json!({ "error": format!("Failed to read response body: {}", e) }).to_string();
        }
    };

    let mut content = clean_html_to_markdown(&html);
    let mut truncated = false;
    if content.len() > max_length {
        content = content.chars().take(max_length).collect();
        content.push_str(&format!(
            "\n\n[Content truncated at {} characters]",
            max_length
        ));
        truncated = true;
    }

    json!({
        "url": raw_url,
        "engine": "native_fetch",
        "length": content.len(),
        "truncated": truncated,
        "content": content
    })
    .to_string()
}
