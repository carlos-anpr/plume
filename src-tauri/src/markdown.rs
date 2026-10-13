use comrak::adapters::{HeadingAdapter, HeadingMeta};
use comrak::nodes::{NodeValue, Sourcepos};
use comrak::options::Plugins;
use comrak::{Anchorizer, Arena, Options, parse_document};
use serde::Serialize;
use std::{
    fmt::{self, Write},
    sync::{Mutex, OnceLock},
};
use syntect::{
    html::{ClassStyle, ClassedHTMLGenerator},
    parsing::SyntaxSet,
    util::LinesWithEndings,
};

#[derive(Serialize, Debug)]
pub struct Heading {
    pub level: u8,
    pub text: String,
    pub id: String,
    pub line: usize,
}
#[derive(Serialize, Debug)]
pub struct DocStats {
    pub words: usize,
    pub chars: usize,
    pub lines: usize,
    pub reading_minutes: usize,
}
#[derive(Serialize, Debug)]
pub struct RenderResult {
    pub html: String,
    pub toc: Vec<Heading>,
    pub stats: DocStats,
    pub front_matter: Option<String>,
}

pub fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
fn source_attr(pos: Sourcepos) -> String {
    format!(" data-sourcepos=\"{}\"", pos)
}
#[derive(Default)]
struct Headings(Mutex<(Anchorizer, Vec<Heading>)>);
impl HeadingAdapter for Headings {
    fn enter(
        &self,
        out: &mut dyn fmt::Write,
        meta: &HeadingMeta,
        pos: Option<Sourcepos>,
    ) -> fmt::Result {
        let mut state = self.0.lock().map_err(|_| fmt::Error)?;
        let id = state.0.anchorize(&meta.content);
        state.1.push(Heading {
            level: meta.level,
            text: meta.content.clone(),
            id: id.clone(),
            line: pos.map_or(1, |p| p.start.line),
        });
        write!(
            out,
            "<h{} id=\"{}\"{}>",
            meta.level,
            escape(&id),
            pos.map(source_attr).unwrap_or_default()
        )
    }
    fn exit(&self, out: &mut dyn fmt::Write, meta: &HeadingMeta) -> fmt::Result {
        writeln!(out, "</h{}>", meta.level)
    }
}
fn code_html(lang: &str, code: &str, pos: Sourcepos) -> String {
    let kind = match lang {
        "mermaid" => Some("mermaid"),
        "chart" | "echarts" => Some("chart"),
        "math" => Some("math"),
        _ => None,
    };
    if let Some(kind) = kind {
        return format!(
            "<pre class=\"plume-diagram\" data-kind=\"{kind}\"{}><code>{}</code></pre>\n",
            source_attr(pos),
            escape(code)
        );
    }
    static SYNTAXES: OnceLock<SyntaxSet> = OnceLock::new();
    let syntaxes = SYNTAXES.get_or_init(SyntaxSet::load_defaults_newlines);
    let syntax = syntaxes
        .find_syntax_by_token(match lang {
            "typescript" | "ts" | "tsx" | "jsx" => "js",
            "shell" | "bash" => "sh",
            _ => lang,
        })
        .unwrap_or_else(|| syntaxes.find_syntax_plain_text());
    let mut generator = ClassedHTMLGenerator::new_with_class_style(
        syntax,
        syntaxes,
        ClassStyle::SpacedPrefixed { prefix: "hl-" },
    );
    let mut failed = false;
    for line in LinesWithEndings::from(code) {
        if generator
            .parse_html_for_line_which_includes_newline(line)
            .is_err()
        {
            failed = true;
            break;
        }
    }
    let highlighted = if failed {
        escape(code)
    } else {
        generator.finalize()
    };
    format!(
        "<pre class=\"plume-code\" data-lang=\"{}\"{}><code>{highlighted}</code></pre>\n",
        escape(lang),
        source_attr(pos)
    )
}
comrak::create_formatter!(PlumeFormatter, {
    NodeValue::CodeBlock(ref block) => |context, node, entering| {
        if entering {
            let lang = block.info.split_whitespace().next().unwrap_or("").to_lowercase();
            context.write_str(&code_html(&lang, &block.literal, node.data().sourcepos))?;
        }
        return Ok(comrak::html::ChildRendering::Skip);
    },
});
fn sanitizer() -> &'static ammonia::Builder<'static> {
    static SANITIZER: OnceLock<ammonia::Builder<'static>> = OnceLock::new();
    SANITIZER.get_or_init(|| {
        let mut builder = ammonia::Builder::default();
        builder
            .add_tags(&[
                "details", "summary", "kbd", "sub", "sup", "mark", "input", "section",
            ])
            .add_generic_attributes(&["class", "id", "align", "width", "height"])
            .generic_attribute_prefixes(["data-"].into_iter().collect())
            .add_tag_attributes("input", &["type", "checked", "disabled"]);
        builder
    })
}
pub fn render(source: &str) -> Result<RenderResult, String> {
    let mut options = Options::default();
    options.extension.table = true;
    options.extension.strikethrough = true;
    options.extension.autolink = true;
    options.extension.tasklist = true;
    options.extension.footnotes = true;
    options.extension.description_lists = true;
    options.extension.superscript = true;
    options.extension.subscript = true;
    options.extension.highlight = true;
    options.extension.alerts = true;
    options.extension.math_dollars = true;
    options.extension.math_code = true;
    options.extension.front_matter_delimiter = Some("---".into());
    options.render.sourcepos = true;
    let arena = Arena::new();
    let root = parse_document(&arena, source, &options);
    let mut front_matter = None;
    let mut has_raw_html = false;
    for node in root.descendants() {
        let mut data = node.data.borrow_mut();
        match &data.value {
            NodeValue::FrontMatter(text) => {
                front_matter = Some(
                    text.lines()
                        .skip(1)
                        .take_while(|line| *line != "---")
                        .collect::<Vec<_>>()
                        .join("\n"),
                );
            }
            NodeValue::Math(_) => {
                if let NodeValue::Math(math) = &mut data.value {
                    math.dollar_math = true;
                }
            }
            NodeValue::HtmlBlock(_) | NodeValue::HtmlInline(_) => has_raw_html = true,
            _ => {}
        }
    }
    // Comrak's safe renderer escapes text/attributes and rejects dangerous Markdown URLs.
    // Only raw-HTML documents need unsafe rendering followed by a full Ammonia pass.
    options.render.r#unsafe = has_raw_html;
    let headings = Headings::default();
    let mut plugins = Plugins::default();
    plugins.render.heading_adapter = Some(&headings);
    let mut html = String::new();
    PlumeFormatter::format_document_with_plugins(root, &options, &mut html, &plugins)
        .map_err(|_| "No se pudo renderizar el documento".to_string())?;
    let html = if has_raw_html {
        sanitizer().clean(&html).to_string()
    } else {
        html
    };
    let toc = headings
        .0
        .into_inner()
        .map_err(|_| "No se pudo crear el índice".to_string())?
        .1;
    let words = source.split_whitespace().count();
    Ok(RenderResult {
        html,
        toc,
        front_matter,
        stats: DocStats {
            words,
            chars: source.chars().count(),
            lines: source.bytes().filter(|&c| c == b'\n').count() + 1,
            reading_minutes: words.div_ceil(200),
        },
    })
}
#[tauri::command]
pub async fn render_markdown(source: String) -> Result<RenderResult, String> {
    tauri::async_runtime::spawn_blocking(move || render(&source))
        .await
        .map_err(|_| "No se pudo renderizar el documento".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rich_markdown_contract() {
        let result = render("---\ntitle: Hola\n---\n# Uno\n# Uno\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n$x+1$\n\n$$x^2$$\n\n> [!NOTE]\n> Atención\n\n```mermaid\ngraph TD; A-->B\n```\n\n```chart\n{\"type\":\"bar\"}\n```\n\n```math\nx^2\n```\n\n```rust\nfn main() {}\n```\n").unwrap();
        assert_eq!(result.front_matter.as_deref(), Some("title: Hola"));
        for snippet in [
            "<table",
            "data-math-style=\"inline\"",
            "data-math-style=\"display\"",
            "markdown-alert",
            "data-kind=\"mermaid\"",
            "data-kind=\"chart\"",
            "data-kind=\"math\"",
            "plume-code",
            "hl-",
            "data-sourcepos=",
        ] {
            assert!(result.html.contains(snippet), "{snippet}: {}", result.html);
        }
        assert_eq!(result.toc[0].line, 4);
        assert_eq!(result.toc[1].id, "uno-1");
        for heading in &result.toc {
            assert!(result.html.contains(&format!("id=\"{}\"", heading.id)));
        }
    }
    #[test]
    fn front_matter_delimiters_and_math_code_contract() {
        let result = render("---\ntitle: Hola\n\n---\n\n$`x^2`$\n").unwrap();
        assert_eq!(result.front_matter.as_deref(), Some("title: Hola\n"));
        assert!(result.html.contains("<span data-math-style=\"inline\""));
        assert!(!result.html.contains("<code data-math-style"));
        assert!(render("text without YAML").unwrap().front_matter.is_none());
    }
    #[test]
    fn auxiliary_extensions_and_typescript_highlight() {
        let html = render("==mark== H~2~O\n\n[^n]: note\n\nFootnote[^n].\n\n```typescript\nconst value = 42;\n```").unwrap().html;
        for tag in [
            "<mark",
            "<sub",
            "<section",
            "class=\"footnotes\"",
            "hl-keyword",
        ] {
            assert!(html.contains(tag), "{tag}: {html}");
        }
    }
    #[test]
    fn xss_is_removed_but_safe_html_survives() {
        let html = render("<script>alert(1)</script>\n\n<img src=\"x\" onerror=\"alert(1)\"><a href=\"javascript:alert(1)\">bad</a><details id=\"ok\" data-test=\"yes\"><summary>Title</summary><kbd>X</kbd><mark>yes</mark></details>").unwrap().html;
        for bad in ["<script", "onerror", "javascript:"] {
            assert!(!html.contains(bad), "{html}");
        }
        for good in ["<details", "<summary", "<kbd", "<mark", "data-test=\"yes\""] {
            assert!(html.contains(good), "{html}");
        }
    }
    #[test]
    fn markdown_urls_cannot_execute_script_in_safe_rendering() {
        for source in [
            "[x](javascript:alert%281%29)",
            "[x](JaVaScRiPt:alert%281%29)",
            "[x](&#106;avascript:alert%281%29)",
            "![x](javascript:alert%281%29)",
            "[x](vbscript:bad)",
            "![x](data:text/html,bad)",
        ] {
            let html = render(source).unwrap().html.to_lowercase();
            assert!(
                !html.contains("javascript:")
                    && !html.contains("vbscript:")
                    && !html.contains("data:text/html"),
                "{html}"
            );
        }
    }
    #[test]
    fn fenced_input_is_escaped() {
        let html = render("```mermaid\n</code><script>x</script>\n```")
            .unwrap()
            .html;
        assert!(html.contains("&lt;script&gt;"));
    }
    #[test]
    fn stats_unicode_and_empty() {
        let r = render("á 😊\nfin").unwrap();
        assert_eq!(r.stats.chars, 7);
        assert_eq!(r.stats.lines, 2);
        assert_eq!(r.stats.words, 3);
        assert_eq!(render("").unwrap().stats.reading_minutes, 0);
    }
    #[test]
    #[ignore]
    fn benchmark_10000_lines() {
        let row = "Una línea con **énfasis**, $x$ y [enlace](https://example.com).\n\n";
        render("warmup").unwrap();
        for count in [1000, 10000] {
            let source = row.repeat(count / 2);
            let mut times = Vec::new();
            for _ in 0..5 {
                let start = std::time::Instant::now();
                let result = render(&source).unwrap();
                assert!(!result.html.is_empty());
                times.push(start.elapsed());
            }
            times.sort();
            eprintln!("{count} líneas: mediana {:?} (5 ejecuciones)", times[2]);
        }
    }
}
