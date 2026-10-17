use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

pub fn render_status_bar(frame: &mut Frame, area: Rect) {
    let line = Line::from(vec![
        Span::styled("Commands: ", Style::default().fg(Color::DarkGray)),
        Span::styled("/help", Style::default().fg(Color::Yellow)),
        Span::styled(" | ", Style::default().fg(Color::DarkGray)),
        Span::styled("/clear", Style::default().fg(Color::Yellow)),
        Span::styled(" | ", Style::default().fg(Color::DarkGray)),
        Span::styled("/history", Style::default().fg(Color::Yellow)),
        Span::styled(" | ", Style::default().fg(Color::DarkGray)),
        Span::styled("/exit", Style::default().fg(Color::Yellow)),
        Span::styled(" | ", Style::default().fg(Color::DarkGray)),
        Span::styled("Ctrl+C", Style::default().fg(Color::Gray)),
        Span::styled(" to quit", Style::default().fg(Color::DarkGray)),
    ]);

    let paragraph = Paragraph::new(vec![line]);
    frame.render_widget(paragraph, area);
}
