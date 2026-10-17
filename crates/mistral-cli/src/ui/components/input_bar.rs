use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::Paragraph;
use ratatui::Frame;

pub const SPINNER_FRAMES: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

pub fn render_input_bar(
    frame: &mut Frame,
    area: Rect,
    value: &str,
    is_loading: bool,
    loading_text: &str,
    spinner_frame_index: usize,
) {
    let line = if is_loading {
        let frame_char = SPINNER_FRAMES[spinner_frame_index % SPINNER_FRAMES.len()];
        Line::from(vec![Span::styled(
            format!("{} {}", frame_char, loading_text),
            Style::default().fg(Color::Cyan),
        )])
    } else {
        Line::from(vec![
            Span::styled(
                "codestral> ",
                Style::default().fg(Color::Magenta).add_modifier(Modifier::BOLD),
            ),
            Span::raw(value),
            Span::styled("█", Style::default().fg(Color::DarkGray)),
        ])
    };

    let paragraph = Paragraph::new(vec![line]);
    frame.render_widget(paragraph, area);
}
