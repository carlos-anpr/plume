use std::{path::PathBuf, sync::Mutex};
use tauri::Manager;
#[derive(Default)]
pub struct ConfigState(pub Mutex<()>);
pub fn config_path(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|_| "No se pudo localizar la configuración")?;
    std::fs::create_dir_all(&directory)
        .map_err(|_| "No se pudo crear la carpeta de configuración")?;
    Ok(directory.join(name))
}
pub fn read_json(
    path: &std::path::Path,
    default: serde_json::Value,
) -> Result<serde_json::Value, String> {
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|_| "El archivo de configuración no es válido".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(default),
        Err(_) => Err("No se pudo leer la configuración".into()),
    }
}
#[tauri::command]
pub fn load_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, ConfigState>,
) -> Result<serde_json::Value, String> {
    let _lock = state
        .0
        .lock()
        .map_err(|_| "No se pudo leer la configuración")?;
    read_json(&config_path(&app, "settings.json")?, serde_json::json!({}))
}
#[tauri::command]
pub fn save_settings(
    settings: serde_json::Value,
    app: tauri::AppHandle,
    state: tauri::State<'_, ConfigState>,
) -> Result<(), String> {
    let _lock = state
        .0
        .lock()
        .map_err(|_| "No se pudo guardar la configuración")?;
    let bytes = serde_json::to_vec_pretty(&settings)
        .map_err(|_| "No se pudo serializar la configuración")?;
    crate::files::atomic_write(&config_path(&app, "settings.json")?, &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_are_opaque_and_corruption_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        assert_eq!(
            read_json(&path, serde_json::json!({})).unwrap(),
            serde_json::json!({})
        );
        for value in [
            serde_json::Value::Null,
            serde_json::json!({"theme":"dark","session":[{"text":"unsaved"}]}),
            serde_json::json!([1, true, "text"]),
        ] {
            crate::files::atomic_write(&path, &serde_json::to_vec(&value).unwrap()).unwrap();
            assert_eq!(read_json(&path, serde_json::json!({})).unwrap(), value);
        }
        std::fs::write(&path, "broken json").unwrap();
        assert!(read_json(&path, serde_json::Value::Null).is_err());
    }
}
