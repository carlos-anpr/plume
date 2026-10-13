#[path = "../src/markdown.rs"]
pub mod markdown;
fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("Usage: render_document file.md");
    let source = std::fs::read_to_string(path).expect("read Markdown");
    let result = markdown::render(&source).expect("render Markdown");
    println!(
        "{}",
        serde_json::to_string(&result).expect("serialize result")
    );
}
