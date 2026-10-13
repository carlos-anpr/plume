use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    collections::HashMap,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::Duration,
};
use tauri::Emitter;

#[derive(Clone, Serialize, Debug)]
struct FileChanged {
    path: String,
    modified_ms: u64,
    removed: bool,
}
#[derive(Clone, Default)]
pub struct WatchState {
    inner: Arc<Mutex<Inner>>,
}
#[derive(Default)]
struct Inner {
    watchers: HashMap<PathBuf, Registration>,
    own_writes: HashMap<PathBuf, u64>,
}
struct Registration {
    _watcher: RecommendedWatcher,
    active: Arc<AtomicBool>,
}
impl Drop for Registration {
    fn drop(&mut self) {
        self.active.store(false, Ordering::Release);
    }
}
fn fingerprint(bytes: &[u8]) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    bytes.hash(&mut hasher);
    hasher.finish()
}
impl WatchState {
    pub fn write(&self, path: &Path, bytes: &[u8]) -> Result<(), String> {
        // Hold the lock until rename: an event can never observe a half-recorded save.
        let mut state = self
            .inner
            .lock()
            .map_err(|_| "No se pudo guardar el archivo")?;
        crate::files::atomic_write(path, bytes)?;
        if state.watchers.contains_key(path) {
            state
                .own_writes
                .insert(path.to_path_buf(), fingerprint(bytes));
        }
        Ok(())
    }
    fn watch(
        &self,
        path: PathBuf,
        emit: impl Fn(FileChanged) + Send + 'static,
    ) -> Result<(), String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|_| "No se pudo vigilar el archivo")?;
        if state.watchers.contains_key(&path) {
            return Ok(());
        }
        let (sender, receiver) = mpsc::channel();
        let event_path = path.clone();
        let mut watcher =
            notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
                if let Ok(event) = result {
                    if event.kind.is_access() {
                        return;
                    }
                    if event.paths.iter().any(|p| p == &event_path) {
                        let _ = sender.send(());
                    }
                }
            })
            .map_err(|_| "No se pudo iniciar la vigilancia")?;
        watcher
            .watch(
                path.parent().ok_or("Ruta no válida")?,
                RecursiveMode::NonRecursive,
            )
            .map_err(|_| "No se pudo vigilar la carpeta")?;
        let weak = Arc::downgrade(&self.inner);
        let mut previous = std::fs::read(&path).ok().map(|bytes| fingerprint(&bytes));
        let mut previous_modified = crate::files::modified_ms(&path);
        let active = Arc::new(AtomicBool::new(true));
        state.watchers.insert(
            path.clone(),
            Registration {
                _watcher: watcher,
                active: active.clone(),
            },
        );
        std::thread::spawn(move || {
            while receiver.recv().is_ok() {
                loop {
                    match receiver.recv_timeout(Duration::from_millis(300)) {
                        Ok(()) => continue,
                        Err(mpsc::RecvTimeoutError::Timeout) => break,
                        Err(_) => return,
                    }
                }
                let Some(inner) = weak.upgrade() else {
                    return;
                };
                let Ok(mut state) = inner.lock() else {
                    return;
                };
                if !active.load(Ordering::Acquire) {
                    return;
                }
                let current = std::fs::read(&path).ok().map(|bytes| fingerprint(&bytes));
                let current_modified = crate::files::modified_ms(&path);
                let removed = !path.exists();
                let own = state.own_writes.remove(&path);
                if (current == previous && current_modified == previous_modified)
                    || (current.is_some() && current == own)
                {
                    previous = current;
                    previous_modified = current_modified;
                    continue;
                }
                previous = current;
                previous_modified = current_modified;
                drop(state);
                emit(FileChanged {
                    path: path.to_string_lossy().into(),
                    modified_ms: current_modified,
                    removed,
                });
            }
        });
        Ok(())
    }
}
#[tauri::command]
pub fn watch_file(
    path: String,
    app: tauri::AppHandle,
    watches: tauri::State<'_, WatchState>,
) -> Result<(), String> {
    watches.watch(crate::files::absolute(&path)?, move |event| {
        let _ = app.emit("plume://file-changed", event);
    })
}
#[tauri::command]
pub fn unwatch_file(path: String, watches: tauri::State<'_, WatchState>) -> Result<(), String> {
    let path = crate::files::absolute(&path)?;
    let mut state = watches
        .inner
        .lock()
        .map_err(|_| "No se pudo detener la vigilancia")?;
    state.watchers.remove(&path);
    state.own_writes.remove(&path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn observes_atomic_external_changes_debounces_and_ignores_own_save() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("watch.md");
        std::fs::write(&path, "initial").unwrap();
        let state = WatchState::default();
        let (sender, receiver) = mpsc::channel();
        state
            .watch(path.clone(), move |event| {
                sender.send(event).unwrap();
            })
            .unwrap();
        state.write(&path, b"own save").unwrap();
        assert!(receiver.recv_timeout(Duration::from_millis(650)).is_err());
        crate::files::atomic_write(&path, b"external save").unwrap();
        crate::files::atomic_write(&path, b"latest external save").unwrap();
        let event = receiver.recv_timeout(Duration::from_secs(3)).unwrap();
        assert_eq!(event.path, path.to_string_lossy());
        assert!(!event.removed);
        assert!(event.modified_ms > 0);
        assert!(receiver.recv_timeout(Duration::from_millis(650)).is_err());
        std::fs::remove_file(&path).unwrap();
        assert!(
            receiver
                .recv_timeout(Duration::from_secs(3))
                .unwrap()
                .removed
        );
        state.inner.lock().unwrap().watchers.remove(&path);
        std::fs::write(&path, "after unwatch").unwrap();
        assert!(receiver.recv_timeout(Duration::from_millis(650)).is_err());
    }
}
