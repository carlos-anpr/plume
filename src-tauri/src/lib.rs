mod files;
mod markdown;
mod recent;
mod settings;
mod watch;
use tauri::{Emitter, Manager};
/// Errores del webview a stderr: sin esto un fallo de arranque deja la ventana oculta y muda.
#[tauri::command]
fn frontend_log(level: String, message: String) {
    eprintln!("[webview:{level}] {message}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let files = files::argv_files(args.into_iter().skip(1), std::path::Path::new(&cwd));
            if !files.is_empty() {
                let _ = app.emit("plume://open-files", files);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(watch::WatchState::default())
        .manage(settings::ConfigState::default())
        .setup(|app| {
            // Red de seguridad: si el frontend no llega a mostrar la ventana, se muestra igual.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(1500));
                if let Some(window) = handle.get_webview_window("main")
                    && !window.is_visible().unwrap_or(true)
                {
                    eprintln!("[plume] el frontend no mostró la ventana a tiempo");
                    let _ = window.show();
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            frontend_log,
            markdown::render_markdown,
            files::open_file,
            files::save_file,
            files::write_text,
            files::launch_files,
            recent::recent_files,
            recent::add_recent,
            watch::watch_file,
            watch::unwatch_file,
            settings::load_settings,
            settings::save_settings
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Plume");
}
