use super::edit_file::execute_edit_file;
use super::execute_command::execute_execute_command;
use super::fetch_web_page::execute_fetch_web_page;
use super::list_files::execute_list_files;
use super::read_file::execute_read_file;
use super::search_files::execute_search_files;
use super::types::ConfirmCallback;
use super::web_search::execute_web_search;
use super::write_file::execute_write_file;
use mistral_client::models::{FunctionDefinition, Tool as MistralTool};
use serde_json::json;
use std::collections::HashMap;
use std::future::Future;
use std::path::Path;
use std::pin::Pin;

pub trait Tool: Send + Sync {
    fn name(&self) -> &'static str;
    fn definition(&self) -> MistralTool;
    fn execute<'a>(
        &'a self,
        args: serde_json::Value,
        workspace_dir: &'a Path,
        on_confirm: &'a Option<ConfirmCallback>,
    ) -> Pin<Box<dyn Future<Output = String> + Send + 'a>>;
}

// 1. ReadFileTool
pub struct ReadFileTool;
impl Tool for ReadFileTool {
    fn name(&self) -> &'static str {
        "read_file"
    }
    fn definition(&self) -> MistralTool {
        MistralTool {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "read_file".to_string(),
                description: "Reads file contents safely from the workspace. Supports start_line and end_line chunking for large files. Blocks path traversal and sensitive credential files.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Relative file path within workspace."
                        },
                        "start_line": {
                            "type": "integer",
                            "description": "1-based starting line number to read (optional)."
                        },
                        "end_line": {
                            "type": "integer",
                            "description": "1-based ending line number to read (optional)."
                        }
                    },
                    "required": ["path"]
                }),
            },
        }
    }
    fn execute<'a>(
        &'a self,
        args: serde_json::Value,
        workspace_dir: &'a Path,
        on_confirm: &'a Option<ConfirmCallback>,
    ) -> Pin<Box<dyn Future<Output = String> + Send + 'a>> {
        Box::pin(execute_read_file(args, workspace_dir, on_confirm))
    }
}

// 2. WriteFileTool
pub struct WriteFileTool;
impl Tool for WriteFileTool {
    fn name(&self) -> &'static str {
        "write_file"
    }
    fn definition(&self) -> MistralTool {
        MistralTool {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "write_file".to_string(),
                description: "Writes or overwrites content to a file in the workspace. Automatically creates missing parent directories. Rejects symbolic links and protects sensitive files.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Relative file path to write within the workspace."
                        },
                        "content": {
                            "type": "string",
                            "description": "Complete text content to write into the file."
                        },
                        "overwrite": {
                            "type": "boolean",
                            "description": "Whether to overwrite the file if it already exists (defaults to true)."
                        }
                    },
                    "required": ["path", "content"]
                }),
            },
        }
    }
    fn execute<'a>(
        &'a self,
        args: serde_json::Value,
        workspace_dir: &'a Path,
        on_confirm: &'a Option<ConfirmCallback>,
    ) -> Pin<Box<dyn Future<Output = String> + Send + 'a>> {
        Box::pin(execute_write_file(args, workspace_dir, on_confirm))
    }
}

// 3. EditFileTool
pub struct EditFileTool;
impl Tool for EditFileTool {
    fn name(&self) -> &'static str {
        "edit_file"
    }
    fn definition(&self) -> MistralTool {
        MistralTool {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "edit_file".to_string(),
                description: "Surgically replaces a specific block of text in a workspace file with new text. Safer and more token-efficient than rewriting the entire file. Fails closed if the target text does not match uniquely.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Relative file path in the workspace to edit."
                        },
                        "target_content": {
                            "type": "string",
                            "description": "Exact block of text to be replaced. Must match existing file content character-for-character including indentation."
                        },
                        "replacement_content": {
                            "type": "string",
                            "description": "New text content to insert in place of target_content."
                        },
                        "expected_matches": {
                            "type": "integer",
                            "description": "Expected number of occurrences to replace (defaults to 1 for unique replacement)."
                        }
                    },
                    "required": ["path", "target_content", "replacement_content"]
                }),
            },
        }
    }
    fn execute<'a>(
        &'a self,
        args: serde_json::Value,
        workspace_dir: &'a Path,
        on_confirm: &'a Option<ConfirmCallback>,
    ) -> Pin<Box<dyn Future<Output = String> + Send + 'a>> {
        Box::pin(execute_edit_file(args, workspace_dir, on_confirm))
    }
}

// 4. ListFilesTool
pub struct ListFilesTool;
impl Tool for ListFilesTool {
    fn name(&self) -> &'static str {
        "list_files"
    }
    fn definition(&self) -> MistralTool {
        MistralTool {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "list_files".to_string(),
                description: "Lists files and directories in a workspace directory. Automatically excludes dependency and VCS directories like node_modules and .git.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Relative directory path to explore (defaults to '.' for workspace root)."
                        },
                        "recursive": {
                            "type": "boolean",
                            "description": "Whether to recursively list all files and subdirectories."
                        }
                    }
                }),
            },
        }
    }
    fn execute<'a>(
        &'a self,
        args: serde_json::Value,
        workspace_dir: &'a Path,
        on_confirm: &'a Option<ConfirmCallback>,
    ) -> Pin<Box<dyn Future<Output = String> + Send + 'a>> {
        Box::pin(execute_list_files(args, workspace_dir, on_confirm))
    }
}

// 5. SearchFilesTool
pub struct SearchFilesTool;
impl Tool for SearchFilesTool {
    fn name(&self) -> &'static str {
        "search_files"
    }
    fn definition(&self) -> MistralTool {
        MistralTool {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "search_files".to_string(),
                description: "Searches for a text or regex pattern across files in the workspace. Returns matched file paths, line numbers, and line contents.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "pattern": {
                            "type": "string",
                            "description": "Text or regular expression pattern to search for."
                        },
                        "path": {
                            "type": "string",
                            "description": "Relative directory path to search within (defaults to '.' for workspace root)."
                        },
                        "case_sensitive": {
                            "type": "boolean",
                            "description": "Whether the search is case-sensitive (default: false)."
                        },
                        "file_pattern": {
                            "type": "string",
                            "description": "Optional file name or extension filter (e.g. '*.ts', 'package.json', '.md')."
                        },
                        "max_results": {
                            "type": "number",
                            "description": "Maximum number of matching lines to return (default: 50, max: 100)."
                        }
                    },
                    "required": ["pattern"]
                }),
            },
        }
    }
    fn execute<'a>(
        &'a self,
        args: serde_json::Value,
        workspace_dir: &'a Path,
        on_confirm: &'a Option<ConfirmCallback>,
    ) -> Pin<Box<dyn Future<Output = String> + Send + 'a>> {
        Box::pin(execute_search_files(args, workspace_dir, on_confirm))
    }
}

// 6. ExecuteCommandTool
pub struct ExecuteCommandTool;
impl Tool for ExecuteCommandTool {
    fn name(&self) -> &'static str {
        "execute_command"
    }
    fn definition(&self) -> MistralTool {
        MistralTool {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "execute_command".to_string(),
                description: "Executes a shell command safely inside a native sandboxed environment (Linux namespaces via Bubblewrap). Confined strictly to the workspace directory with network disabled by default.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "Shell command line to execute inside the sandbox."
                        },
                        "timeout_seconds": {
                            "type": "integer",
                            "description": "Maximum execution time in seconds (default: 30, max: 120)."
                        },
                        "allow_network": {
                            "type": "boolean",
                            "description": "Whether to allow network access. Defaults to false for security."
                        },
                        "allow_env_secrets": {
                            "type": "boolean",
                            "description": "Whether to expose workspace .env to the command. Defaults to false for security."
                        }
                    },
                    "required": ["command"]
                }),
            },
        }
    }
    fn execute<'a>(
        &'a self,
        args: serde_json::Value,
        workspace_dir: &'a Path,
        on_confirm: &'a Option<ConfirmCallback>,
    ) -> Pin<Box<dyn Future<Output = String> + Send + 'a>> {
        Box::pin(execute_execute_command(args, workspace_dir, on_confirm))
    }
}

// 7. WebSearchTool
pub struct WebSearchTool;
impl Tool for WebSearchTool {
    fn name(&self) -> &'static str {
        "web_search"
    }
    fn definition(&self) -> MistralTool {
        MistralTool {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "web_search".to_string(),
                description: "Search the live web for up-to-date documentation, real-time facts, APIs, package releases, and technical articles via Tavily.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search keywords or question to look up on the web."
                        },
                        "max_results": {
                            "type": "number",
                            "description": "Maximum number of search results to return (1-10, default: 5)."
                        },
                        "search_depth": {
                            "type": "string",
                            "enum": ["basic", "advanced"],
                            "description": "Search depth: 'advanced' (recommended default for accurate technical answers) or 'basic' (faster)."
                        },
                        "include_answer": {
                            "type": "boolean",
                            "description": "Whether to include Tavily's direct synthesized answer to the query."
                        },
                        "include_domains": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "Optional list of domains to restrict search to (e.g., ['pypi.org', 'github.com', 'readthedocs.io'])."
                        }
                    },
                    "required": ["query"]
                }),
            },
        }
    }
    fn execute<'a>(
        &'a self,
        args: serde_json::Value,
        _workspace_dir: &'a Path,
        _on_confirm: &'a Option<ConfirmCallback>,
    ) -> Pin<Box<dyn Future<Output = String> + Send + 'a>> {
        Box::pin(execute_web_search(args, None, None))
    }
}

// 8. FetchWebPageTool
pub struct FetchWebPageTool;
impl Tool for FetchWebPageTool {
    fn name(&self) -> &'static str {
        "fetch_web_page"
    }
    fn definition(&self) -> MistralTool {
        MistralTool {
            tool_type: "function".to_string(),
            function: FunctionDefinition {
                name: "fetch_web_page".to_string(),
                description: "Fetches and extracts readable text or markdown content from a web page URL. Ideal for reading documentation, articles, or API references discovered via web_search.".to_string(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "Full HTTP or HTTPS URL to fetch content from."
                        },
                        "max_length": {
                            "type": "number",
                            "description": "Maximum number of characters to return (default: 20000, max: 50000)."
                        }
                    },
                    "required": ["url"]
                }),
            },
        }
    }
    fn execute<'a>(
        &'a self,
        args: serde_json::Value,
        _workspace_dir: &'a Path,
        _on_confirm: &'a Option<ConfirmCallback>,
    ) -> Pin<Box<dyn Future<Output = String> + Send + 'a>> {
        Box::pin(execute_fetch_web_page(args, None, None))
    }
}

pub struct ToolRegistry {
    tools: HashMap<String, Box<dyn Tool>>,
    order: Vec<String>,
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new_default()
    }
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
            order: Vec::new(),
        }
    }

    pub fn register(&mut self, tool: Box<dyn Tool>) {
        let name = tool.name().to_string();
        if !self.tools.contains_key(&name) {
            self.order.push(name.clone());
        }
        self.tools.insert(name, tool);
    }

    pub fn new_default() -> Self {
        let mut reg = Self::new();
        reg.register(Box::new(ReadFileTool));
        reg.register(Box::new(WriteFileTool));
        reg.register(Box::new(EditFileTool));
        reg.register(Box::new(ListFilesTool));
        reg.register(Box::new(SearchFilesTool));
        reg.register(Box::new(ExecuteCommandTool));
        reg.register(Box::new(WebSearchTool));
        reg.register(Box::new(FetchWebPageTool));
        reg
    }

    pub fn get_tool_definitions(&self) -> Vec<MistralTool> {
        self.order
            .iter()
            .filter_map(|name| self.tools.get(name))
            .map(|t| t.definition())
            .collect()
    }

    pub async fn execute_tool(
        &self,
        name: &str,
        args: serde_json::Value,
        workspace_dir: &Path,
        on_confirm: &Option<ConfirmCallback>,
    ) -> String {
        match self.tools.get(name) {
            Some(tool) => tool.execute(args, workspace_dir, on_confirm).await,
            None => json!({
                "error": format!("Tool '{}' is not registered in the system.", name)
            })
            .to_string(),
        }
    }
}
