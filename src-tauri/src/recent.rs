fn read(path: &std::path::Path) -> Result<Vec<String>, String> {
    let value = crate::settings::read_json(path, serde_json::Value::Null)?;
    if value.is_null() {
        return Ok(Vec::new());
    }
    serde_json::from_value(value).map_err(|_| "La lista de recientes no es válida".into())
}
fn promote(mut recent: Vec<String>, path: String) -> Vec<String> {
    recent.retain(|p| p != &path);
    recent.insert(0, path);
    recent.truncate(15);
    recent
}
#[tauri::command]
pub fn recent_files(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::settings::ConfigState>,
) -> Result<Vec<String>, String> {
    let _lock = state
        .0
        .lock()
        .map_err(|_| "No se pudieron leer los recientes")?;
    read(&crate::settings::config_path(&app, "recent.json")?)
}
#[tauri::command]
pub fn add_recent(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::settings::ConfigState>,
) -> Result<Vec<String>, String> {
    let _lock = state
        .0
        .lock()
        .map_err(|_| "No se pudieron guardar los recientes")?;
    let path = crate::files::absolute(&path)?
        .to_string_lossy()
        .into_owned();
    let file = crate::settings::config_path(&app, "recent.json")?;
    let recent = promote(read(&file)?, path);
    crate::files::atomic_write(
        &file,
        &serde_json::to_vec(&recent).map_err(|_| "No se pudieron serializar los recientes")?,
    )?;
    Ok(recent)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unique_bounded_most_recent_first() {
        let mut files = Vec::new();
        for n in 0..20 {
            files = promote(files, n.to_string());
        }
        files = promote(files, "10".into());
        assert_eq!(files.len(), 15);
        assert_eq!(files[0], "10");
        assert_eq!(files.iter().filter(|p| *p == "10").count(), 1);
    }
}
