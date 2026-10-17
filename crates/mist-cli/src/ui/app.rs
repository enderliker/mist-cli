use super::components::{
    render_header, render_input_bar, render_message_list, render_security_prompt,
    render_status_bar, MessageRole, UiMessage,
};
use crate::agent::CodestralAgent;
use crossterm::event::{Event, KeyCode, KeyEvent, KeyModifiers};
use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::Frame;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::sync::{mpsc, oneshot};

static NEXT_MSG_ID: AtomicUsize = AtomicUsize::new(1);

fn next_id() -> String {
    NEXT_MSG_ID.fetch_add(1, Ordering::Relaxed).to_string()
}

pub enum AppEvent {
    TermEvent(Event),
    Tick,
    AgentResponse(Result<String, String>),
    ToolCall { name: String, args: String },
    ToolResult { name: String },
    SecurityConfirmRequest {
        description: String,
        respond_to: oneshot::Sender<bool>,
    },
}

pub struct App {
    pub messages: Vec<UiMessage>,
    pub input_val: String,
    pub is_loading: bool,
    pub loading_text: String,
    pub spinner_frame_index: usize,
    pub confirm_state: Option<(String, oneshot::Sender<bool>)>,
    pub scroll_offset: u16,
    pub auto_scroll: bool,
    pub should_exit: bool,
    pub version: String,
    pub model: String,
    pub server_url: String,
    pub workspace_dir: String,
}

impl App {
    pub fn new(agent: &CodestralAgent, version: &str, workspace_dir: &str) -> Self {
        let config = agent.get_config();
        Self {
            messages: Vec::new(),
            input_val: String::new(),
            is_loading: false,
            loading_text: "Codestral is thinking...".to_string(),
            spinner_frame_index: 0,
            confirm_state: None,
            scroll_offset: 0,
            auto_scroll: true,
            should_exit: false,
            version: version.to_string(),
            model: config.model.clone(),
            server_url: config.server_url.clone(),
            workspace_dir: workspace_dir.to_string(),
        }
    }

    pub fn add_message(&mut self, role: MessageRole, content: impl Into<String>) {
        self.messages.push(UiMessage {
            id: next_id(),
            role,
            content: content.into(),
        });
        self.auto_scroll = true;
    }

    pub fn on_tick(&mut self) {
        if self.is_loading {
            self.spinner_frame_index = self.spinner_frame_index.wrapping_add(1);
        }
    }

    pub fn render(&mut self, frame: &mut Frame) {
        let confirm_active = self.confirm_state.is_some();
        let input_height = if confirm_active { 5 } else { 1 };

        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(5),            // Header
                Constraint::Min(3),               // Messages
                Constraint::Length(input_height), // Input or Security Prompt
                Constraint::Length(1),            // Status Bar
            ])
            .split(frame.area());

        // 1. Header
        render_header(
            frame,
            chunks[0],
            &self.version,
            &self.model,
            &self.server_url,
            &self.workspace_dir,
        );

        // 2. Message List
        render_message_list(
            frame,
            chunks[1],
            &self.messages,
            &mut self.scroll_offset,
            self.auto_scroll,
        );

        // 3. Security Prompt or Input Bar
        if let Some((ref description, _)) = self.confirm_state {
            render_security_prompt(frame, chunks[2], description);
        } else {
            render_input_bar(
                frame,
                chunks[2],
                &self.input_val,
                self.is_loading,
                &self.loading_text,
                self.spinner_frame_index,
            );
        }

        // 4. Status Bar
        render_status_bar(frame, chunks[3]);
    }

    pub fn handle_key(
        &mut self,
        key: KeyEvent,
        prompt_sender: &mpsc::Sender<String>,
        agent_history_reset_sender: &mpsc::Sender<()>,
        agent_history_count: usize,
    ) {
        // 1. Security confirmation prompt active
        if let Some((_, sender)) = self.confirm_state.take() {
            match key.code {
                KeyCode::Char('y') | KeyCode::Char('Y') | KeyCode::Char('s') | KeyCode::Char('S') => {
                    let _ = sender.send(true);
                }
                KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => {
                    let _ = sender.send(false);
                }
                KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                    let _ = sender.send(false);
                }
                _ => {
                    // Put back if key was unrelated
                    self.confirm_state = Some((String::new(), sender));
                }
            }
            return;
        }

        // 2. Ctrl+C always exits
        if key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL) {
            self.should_exit = true;
            return;
        }

        // 3. Scroll keys work whether loading or not
        match key.code {
            KeyCode::Up => {
                self.scroll_offset = self.scroll_offset.saturating_sub(1);
                self.auto_scroll = false;
                return;
            }
            KeyCode::Down => {
                self.scroll_offset = self.scroll_offset.saturating_add(1);
                return;
            }
            KeyCode::PageUp => {
                self.scroll_offset = self.scroll_offset.saturating_sub(5);
                self.auto_scroll = false;
                return;
            }
            KeyCode::PageDown => {
                self.scroll_offset = self.scroll_offset.saturating_add(5);
                return;
            }
            _ => {}
        }

        // 4. If loading, ignore text input
        if self.is_loading {
            return;
        }

        // 5. Handle input keys
        match key.code {
            KeyCode::Enter => {
                let trimmed = self.input_val.trim().to_string();
                self.input_val.clear();
                if trimmed.is_empty() {
                    return;
                }

                if trimmed == "/exit" || trimmed == "/quit" {
                    self.add_message(MessageRole::System, "Goodbye!");
                    self.should_exit = true;
                    return;
                }

                if trimmed == "/clear" {
                    let _ = agent_history_reset_sender.try_send(());
                    self.messages.clear();
                    self.add_message(MessageRole::System, "Conversation history reset.");
                    return;
                }

                if trimmed == "/history" {
                    self.add_message(
                        MessageRole::System,
                        format!("Total messages in memory: {}", agent_history_count),
                    );
                    return;
                }

                if trimmed == "/help" {
                    self.add_message(
                        MessageRole::System,
                        "Available commands:\n  /help     - Show this help menu\n  /clear    - Clear conversation memory\n  /history  - Show message count\n  /exit     - Exit CLI",
                    );
                    return;
                }

                self.add_message(MessageRole::User, trimmed.clone());
                self.is_loading = true;
                self.loading_text = "Codestral is thinking...".to_string();

                let _ = prompt_sender.try_send(trimmed);
            }
            KeyCode::Backspace => {
                self.input_val.pop();
            }
            KeyCode::Esc => {
                self.input_val.clear();
            }
            KeyCode::Char(c) => {
                self.input_val.push(c);
            }
            _ => {}
        }
    }
}
