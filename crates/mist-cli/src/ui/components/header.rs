use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, BorderType, Borders, Paragraph};
use ratatui::Frame;

pub fn render_header(
    frame: &mut Frame,
    area: Rect,
    version: &str,
    model: &str,
    server_url: &str,
    workspace_dir: &str,
) {
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(Color::Green));

    let inner_width = area.width.saturating_sub(4) as usize;

    let left_title = "Mistral Codestral CLI";
    let right_ver = format!("v{}", version);
    let spaces_needed = inner_width.saturating_sub(left_title.len() + right_ver.len());
    let spaces = " ".repeat(spaces_needed);

    let line1 = Line::from(vec![
        Span::styled(
            left_title,
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        ),
        Span::raw(spaces),
        Span::styled(right_ver, Style::default().fg(Color::DarkGray)),
    ]);

    let line2 = Line::from(vec![
        Span::raw("Model: "),
        Span::styled(model, Style::default().fg(Color::Yellow)),
        Span::styled(" | ", Style::default().fg(Color::DarkGray)),
        Span::raw("Endpoint: "),
        Span::styled(server_url, Style::default().fg(Color::Blue)),
    ]);

    let line3 = Line::from(vec![Span::styled(
        format!("Workspace: {}", workspace_dir),
        Style::default().fg(Color::DarkGray),
    )]);

    let paragraph = Paragraph::new(vec![line1, line2, line3]).block(block);
    frame.render_widget(paragraph, area);
}
