#!/usr/bin/env bash
# Instala Plume para el usuario actual (sin sudo): binario, iconos, lanzador y "Abrir con" para .md/.txt.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run tauri build -- --no-bundle
install -Dm755 src-tauri/target/release/plume "$HOME/.local/bin/plume"
for s in 32x32 128x128; do
  install -Dm644 "src-tauri/icons/$s.png" "$HOME/.local/share/icons/hicolor/$s/apps/plume.png"
done
install -Dm644 src-tauri/icons/128x128@2x.png "$HOME/.local/share/icons/hicolor/256x256/apps/plume.png"
install -Dm644 assets/icon.svg "$HOME/.local/share/icons/hicolor/scalable/apps/plume.svg"
cat > "$HOME/.local/share/applications/plume.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Plume
GenericName=Editor de texto
Comment=Bloc de notas con vista previa Markdown
Exec=$HOME/.local/bin/plume %F
Icon=plume
Terminal=false
Categories=Utility;TextEditor;
MimeType=text/markdown;text/x-markdown;text/plain;
Keywords=markdown;notas;editor;texto;md;
StartupNotify=true
StartupWMClass=plume
DESKTOP
update-desktop-database "$HOME/.local/share/applications"
gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
echo "Plume instalado en $HOME/.local/bin/plume"
