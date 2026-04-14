# SecondMind Brand Assets

## Color

- Accent: `#878bf9` (violet desaturado — generado por Recraft)
- Dark bg: `#171617`
- Paleta completa pendiente de migrar desde `#7b2ad1`

## Archivos

### `/logo/` — Originales de referencia

| Archivo                      | Uso                                                   |
| ---------------------------- | ----------------------------------------------------- |
| `app-icon.svg`               | Ícono con fondo oscuro squircle (vector editable)     |
| `brain-mark-transparent.svg` | Solo el cerebro, fondo transparente (vector)          |
| `app-icon-1024.png`          | Máxima resolución con fondo                           |
| `brain-mark-1024.png`        | Máxima resolución sin fondo                           |
| `maskable.svg`               | Versión con safe zone 80% para Android adaptive icons |

### `/favicon/` → Copiar a `public/`

| Archivo             | Uso                                |
| ------------------- | ---------------------------------- |
| `favicon.svg`       | Favicon vector (browsers modernos) |
| `favicon-16x16.png` | Favicon fallback                   |
| `favicon-32x32.png` | Favicon fallback                   |

### `/pwa/` → Copiar a `public/`

| Archivo                    | Uso                        |
| -------------------------- | -------------------------- |
| `pwa-192x192.png`          | PWA manifest icon          |
| `pwa-512x512.png`          | PWA manifest icon + splash |
| `pwa-maskable-512x512.png` | PWA manifest maskable icon |
| `apple-touch-icon.png`     | iOS bookmark (180×180)     |

### `/extension/` → Copiar a `extension/icons/`

| Archivo        | Uso                       |
| -------------- | ------------------------- |
| `icon-16.png`  | Extension toolbar         |
| `icon-48.png`  | Extension management page |
| `icon-128.png` | Chrome Web Store          |

### `/tauri/` → Copiar a `src-tauri/icons/`

| Archivo          | Uso                    |
| ---------------- | ---------------------- |
| `32x32.png`      | System tray icon       |
| `128x128.png`    | App icon               |
| `128x128@2x.png` | App icon HiDPI         |
| `icon.png`       | Default icon (256×256) |

### `/android/` → Se genera con `npx @capacitor/assets` en Fase 5.2

Vacío por ahora — se genera automáticamente desde `pwa-512x512.png`.
