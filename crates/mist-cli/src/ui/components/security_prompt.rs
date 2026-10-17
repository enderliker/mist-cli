use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, BorderType, Borders, Paragraph};
use ratatui::Frame;

pub fn render_security_prompt(frame: &mut Frame, area: Rect, description: &str) {
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Double)
        .border_style(Style::default().fg(Color::Yellow));

    let line1 = Line::from(vec![Span::styled(
        "⚠️  Security Authorization Required",
        Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD),
    )]);

    let line2 = Line::from(vec![Span::raw(format!(
        "Codestral requests permission to {}.",
        description
    ))]);

    let line3 = Line::from(vec![
        Span::raw("Authorize? Press "),
        Span::styled(
            "[y]",
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        ),
        Span::raw(" to confirm, "),
        Span::styled(
            "[n]",
            Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
        ),
        Span::raw(" to deny."),
    ]);

    let paragraph = Paragraph::new(vec![line1, line2, line3]).block(block);
    frame.render_widget(paragraph, area);
}
