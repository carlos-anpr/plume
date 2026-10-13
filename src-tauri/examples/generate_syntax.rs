use syntect::{
    highlighting::ThemeSet,
    html::{ClassStyle, css_for_theme_with_class_style},
};
fn main() {
    let themes = ThemeSet::load_defaults();
    let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/preview");
    for (mode, name) in [("light", "InspiredGitHub"), ("dark", "base16-ocean.dark")] {
        let css = css_for_theme_with_class_style(
            &themes.themes[name],
            ClassStyle::SpacedPrefixed { prefix: "hl-" },
        )
        .expect("theme CSS");
        let mut prefixed = String::from("/* Regenerate: cargo run --example generate_syntax */\n");
        let css = css
            .split_once("*/")
            .map_or(css.as_str(), |(_, rules)| rules);
        for rule in css.split('}') {
            if let Some((selectors, body)) = rule.split_once('{') {
                let selectors = selectors
                    .split(',')
                    .map(|selector| {
                        format!(
                            ":root[data-theme={mode}] .plume-preview {}",
                            selector.trim()
                        )
                    })
                    .collect::<Vec<_>>()
                    .join(", ");
                prefixed.push_str(&format!("{selectors} {{{body}}}\n"));
            }
        }
        prefixed.push_str(&format!(":root[data-theme={mode}] .plume-preview .hl-invalid, :root[data-theme={mode}] .plume-preview .hl-illegal, :root[data-theme={mode}] .plume-preview .hl-invalid.hl-illegal {{ color: inherit !important; background-color: transparent !important; font-style: inherit; font-weight: inherit; }}\n"));
        let file = directory.join(format!("syntax-{mode}.css"));
        if std::env::args().any(|arg| arg == "--check") {
            assert_eq!(
                std::fs::read_to_string(file).expect("read CSS"),
                prefixed,
                "Regenerate syntax-{mode}.css"
            );
        } else {
            std::fs::write(file, prefixed).expect("write CSS");
        }
    }
}
