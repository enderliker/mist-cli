use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Paragraph, Wrap};
use ratatui::Frame;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MessageRole {
    User,
    Assistant,
    ToolCall,
    ToolResult,
    Error,
    System,
}

#[derive(Clone, Debug)]
pub struct UiMessage {
    pub id: String,
    pub role: MessageRole,
    pub content: String,
}

pub fn render_message_list(
    frame: &mut Frame,
    area: Rect,
    messages: &[UiMessage],
    scroll_offset: &mut u16,
    auto_scroll: bool,
) {
    if messages.is_empty() {
        let empty_line = Line::from(vec![Span::styled(
            "Type your prompt or /help to view available commands.",
            Style::default().fg(Color::DarkGray),
        )]);
        let paragraph = Paragraph::new(vec![empty_line]);
        frame.render_widget(paragraph, area);
        return;
    }

    let mut lines: Vec<Line> = Vec::new();

    for msg in messages {
        match msg.role {
            MessageRole::User => {
                lines.push(Line::from(vec![
                    Span::styled(
                        "❯ ",
                        Style::default()
                            .fg(Color::Magenta)
                            .add_modifier(Modifier::BOLD),
                    ),
                    Span::raw(msg.content.clone()),
                ]));
            }
            MessageRole::Assistant => {
                lines.push(Line::default());
                let line_len = area.width.saturating_sub(16) as usize;
                let top_border = "─".repeat(line_len);
                lines.push(Line::from(vec![
                    Span::styled("┌─ ", Style::default().fg(Color::DarkGray)),
                    Span::styled(
                        "Codestral:",
                        Style::default()
                            .fg(Color::Green)
                            .add_modifier(Modifier::BOLD),
                    ),
                    Span::styled(
                        format!(" {}┐", top_border),
                        Style::default().fg(Color::DarkGray),
                    ),
                ]));

                for content_line in msg.content.lines() {
                    lines.push(Line::from(vec![
                        Span::styled("│ ", Style::default().fg(Color::DarkGray)),
                        Span::raw(content_line.to_string()),
                    ]));
                }

                let bottom_border = "─".repeat(area.width.saturating_sub(4) as usize);
                lines.push(Line::from(vec![Span::styled(
                    format!("└{}┘", bottom_border),
                    Style::default().fg(Color::DarkGray),
                )]));
                lines.push(Line::default());
            }
            MessageRole::ToolCall => {
                lines.push(Line::from(vec![
                    Span::styled("[Tool] ", Style::default().fg(Color::Cyan)),
                    Span::styled(msg.content.clone(), Style::default().fg(Color::DarkGray)),
                ]));
            }
            MessageRole::ToolResult => {
                lines.push(Line::from(vec![
                    Span::styled("[Result] ", Style::default().fg(Color::Green)),
                    Span::styled(msg.content.clone(), Style::default().fg(Color::DarkGray)),
                ]));
            }
            MessageRole::Error => {
                lines.push(Line::from(vec![
                    Span::styled(
                        "[Error] ",
                        Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
                    ),
                    Span::styled(msg.content.clone(), Style::default().fg(Color::Red)),
                ]));
            }
            MessageRole::System => {
                lines.push(Line::from(vec![Span::styled(
                    msg.content.clone(),
                    Style::default().fg(Color::DarkGray),
                )]));
            }
        }
    }

    let total_lines = lines.len() as u16;
    let visible_height = area.height;

    if (auto_scroll || *scroll_offset + visible_height > total_lines)
        && total_lines > visible_height
    {
        *scroll_offset = total_lines.saturating_sub(visible_height);
    }

    let paragraph = Paragraph::new(lines)
        .wrap(Wrap { trim: false })
        .scroll((*scroll_offset, 0));

    frame.render_widget(paragraph, area);
}
