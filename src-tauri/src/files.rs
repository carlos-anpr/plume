use encoding_rs::{Encoding, UTF_8, UTF_16BE, UTF_16LE};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
pub enum LineEnding {
    #[serde(rename = "LF")]
    Lf,
    #[serde(rename = "CRLF")]
    Crlf,
}
#[derive(Serialize, Debug)]
pub struct OpenedDoc {
    pub path: String,
    pub content: String,
    pub encoding: String,
    pub has_bom: bool,
    pub line_ending: LineEnding,
    pub modified_ms: u64,
}
#[derive(Deserialize)]
pub struct SaveRequest {
    pub path: String,
    pub content: String,
    pub encoding: String,
    pub has_bom: bool,
    pub line_ending: LineEnding,
}
#[derive(Serialize)]
pub struct SaveResult {
    pub modified_ms: u64,
}
pub fn absolute(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    let path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|_| "No se pudo localizar el archivo")?
            .join(path)
    };
    if path.exists() {
        return fs::canonicalize(path).map_err(|_| "No se pudo localizar el archivo".into());
    }
    let parent = path.parent().ok_or("Ruta de archivo no válida")?;
    let parent = fs::canonicalize(parent).map_err(|_| "La carpeta no existe")?;
    Ok(parent.join(path.file_name().ok_or("Ruta de archivo no válida")?))
}
pub fn modified_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64)
}
fn detect_utf16(bytes: &[u8]) -> Option<&'static Encoding> {
    if bytes.len() < 4 || !bytes.len().is_multiple_of(2) {
        return None;
    }
    let sample = &bytes[..bytes.len().min(4096)];
    let pairs = sample.len() / 2;
    let even = sample.iter().step_by(2).filter(|&&b| b == 0).count();
    let odd = sample
        .iter()
        .skip(1)
        .step_by(2)
        .filter(|&&b| b == 0)
        .count();
    if odd * 3 > pairs && even * 10 < pairs {
        Some(UTF_16LE)
    } else if even * 3 > pairs && odd * 10 < pairs {
        Some(UTF_16BE)
    } else {
        None
    }
}
pub fn read(path: &str) -> Result<OpenedDoc, String> {
    let path = absolute(path)?;
    let bytes = fs::read(&path).map_err(|_| "No se pudo leer el archivo")?;
    let (encoding, bom_len) = if let Some((encoding, len)) = Encoding::for_bom(&bytes) {
        (encoding, len)
    } else if let Some(encoding) = detect_utf16(&bytes) {
        (encoding, 0)
    } else if std::str::from_utf8(&bytes).is_ok() {
        (UTF_8, 0)
    } else {
        let mut detector = chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Deny);
        detector.feed(&bytes, true);
        (detector.guess(None, chardetng::Utf8Detection::Allow), 0)
    };
    let (decoded, errors) = encoding.decode_without_bom_handling(&bytes[bom_len..]);
    if errors {
        return Err("El archivo contiene texto con una codificación no válida".into());
    }
    let line_ending = if decoded.contains("\r\n") {
        LineEnding::Crlf
    } else {
        LineEnding::Lf
    };
    Ok(OpenedDoc {
        path: path.to_string_lossy().into_owned(),
        content: decoded.replace("\r\n", "\n").replace('\r', "\n"),
        encoding: encoding.name().into(),
        has_bom: bom_len > 0,
        line_ending,
        modified_ms: modified_ms(&path),
    })
}
pub fn encode(req: &SaveRequest) -> Result<Vec<u8>, String> {
    let encoding =
        Encoding::for_label(req.encoding.as_bytes()).ok_or("Codificación desconocida")?;
    let normalized = req.content.replace("\r\n", "\n").replace('\r', "\n");
    let content = if req.line_ending == LineEnding::Crlf {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };
    let mut bytes = Vec::new();
    if encoding == UTF_16LE || encoding == UTF_16BE {
        if req.has_bom {
            bytes.extend_from_slice(if encoding == UTF_16LE {
                &[0xff, 0xfe]
            } else {
                &[0xfe, 0xff]
            });
        }
        for unit in content.encode_utf16() {
            bytes.extend_from_slice(&if encoding == UTF_16LE {
                unit.to_le_bytes()
            } else {
                unit.to_be_bytes()
            });
        }
    } else {
        if req.has_bom && encoding != UTF_8 {
            return Err("Esta codificación no admite BOM".into());
        }
        if req.has_bom {
            bytes.extend_from_slice(&[0xef, 0xbb, 0xbf]);
        }
        let (encoded, _, errors) = encoding.encode(&content);
        if errors {
            return Err("La codificación elegida no admite todos los caracteres".into());
        }
        bytes.extend_from_slice(&encoded);
    }
    Ok(bytes)
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Ruta no válida")?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|_| "No se pudo crear el archivo temporal")?;
    if let Ok(metadata) = fs::metadata(path) {
        temporary
            .as_file()
            .set_permissions(metadata.permissions())
            .map_err(|_| "No se pudieron conservar los permisos")?;
    } else {
        // El temporal nace con 0600; un fichero nuevo debe quedar como lo dejaría cualquier editor.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            temporary
                .as_file()
                .set_permissions(fs::Permissions::from_mode(0o644))
                .map_err(|_| "No se pudieron fijar los permisos")?;
        }
    }
    temporary
        .write_all(bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|_| "No se pudo escribir el archivo")?;
    temporary
        .persist(path)
        .map_err(|_| "No se pudo guardar el archivo")?;
    #[cfg(unix)]
    fs::File::open(parent)
        .and_then(|f| f.sync_all())
        .map_err(|_| "No se pudo sincronizar la carpeta")?;
    Ok(())
}
#[tauri::command]
pub async fn open_file(path: String) -> Result<OpenedDoc, String> {
    tauri::async_runtime::spawn_blocking(move || read(&path))
        .await
        .map_err(|_| "No se pudo abrir el archivo".to_string())?
}
#[tauri::command]
pub async fn save_file(
    req: SaveRequest,
    watches: tauri::State<'_, crate::watch::WatchState>,
) -> Result<SaveResult, String> {
    let watches = watches.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = absolute(&req.path)?;
        let bytes = encode(&req)?;
        watches.write(&path, &bytes)?;
        Ok(SaveResult {
            modified_ms: modified_ms(&path),
        })
    })
    .await
    .map_err(|_| "No se pudo guardar el archivo".to_string())?
}
#[tauri::command]
pub async fn write_text(
    path: String,
    content: String,
    watches: tauri::State<'_, crate::watch::WatchState>,
) -> Result<(), String> {
    let watches = watches.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        watches.write(&absolute(&path)?, content.as_bytes())
    })
    .await
    .map_err(|_| "No se pudo escribir el archivo".to_string())?
}
pub fn argv_files(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<String> {
    args.into_iter()
        .filter(|arg| !arg.starts_with('-'))
        .filter_map(|arg| {
            let path = Path::new(&arg);
            let path = if path.is_absolute() {
                path.to_path_buf()
            } else {
                cwd.join(path)
            };
            fs::canonicalize(path)
                .ok()
                .filter(|p| p.is_file())
                .map(|p| p.to_string_lossy().into_owned())
        })
        .collect()
}
#[tauri::command]
pub fn launch_files() -> Result<Vec<String>, String> {
    let cwd = std::env::current_dir().map_err(|_| "No se pudo localizar la carpeta actual")?;
    Ok(argv_files(std::env::args().skip(1), &cwd))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn encodings_crlf_and_atomic_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        for (encoding, bom) in [
            ("UTF-8", false),
            ("UTF-8", true),
            ("UTF-16LE", true),
            ("UTF-16LE", false),
            ("UTF-16BE", true),
            ("UTF-16BE", false),
            ("windows-1252", false),
        ] {
            let path = dir.path().join("test.md");
            let req = SaveRequest {
                path: path.to_string_lossy().into(),
                content: "España: café, niño, acción €\nsegunda línea\n".into(),
                encoding: encoding.into(),
                has_bom: bom,
                line_ending: LineEnding::Crlf,
            };
            let bytes = encode(&req).unwrap();
            atomic_write(&path, &bytes).unwrap();
            let result = read(&req.path).unwrap();
            assert_eq!(result.content, req.content);
            assert_eq!(result.encoding, encoding);
            assert_eq!(result.has_bom, bom);
            assert_eq!(result.line_ending, LineEnding::Crlf);
            assert_eq!(fs::read(&path).unwrap(), bytes);
            atomic_write(&path, b"replacement").unwrap();
            assert_eq!(fs::read(&path).unwrap(), b"replacement");
            assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
        }
    }
    #[test]
    fn unrepresentable_text_does_not_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("keep.txt");
        fs::write(&path, "original").unwrap();
        let req = SaveRequest {
            path: path.to_string_lossy().into(),
            content: "😊".into(),
            encoding: "windows-1252".into(),
            has_bom: false,
            line_ending: LineEnding::Lf,
        };
        assert!(encode(&req).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
    }
    #[cfg(unix)]
    #[test]
    fn new_file_is_not_private() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nuevo.md");
        atomic_write(&path, b"x").unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o644
        );
    }
    #[test]
    fn failed_write_preserves_original() {
        let dir = tempfile::tempdir().unwrap();
        assert!(atomic_write(&dir.path().join("missing/x"), b"x").is_err());
    }
}
