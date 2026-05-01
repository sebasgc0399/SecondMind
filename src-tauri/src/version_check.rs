//! F7.1 — Version check + cache purge ANTES del WebView load.
//!
//! Resuelve chicken-and-egg donde un Service Worker residual de versiones
//! previas (workbox autoUpdate + skipWaiting pre-F36 fase B) intercepta
//! tauri.localhost/ y sirve un index.html cacheado del bundle viejo. El
//! hook JS useVersionCheck quedaba inalcanzable porque vive en el bundle
//! que el SW viejo no servía.
//!
//! Approach: comparar la version actual contra una marca persistida en
//! disco (no localStorage que vive dentro del WebView), y si hay mismatch
//! purgar Service Worker + CacheStorage. Dos estrategias en orden:
//!
//! 1. Filesystem (Windows-only, granular): `remove_dir_all` sobre
//!    `EBWebView/Default/Service Worker/` del profile WebView2. Preserva
//!    IndexedDB (Firebase auth + TinyBase persistence) intacto. Puede
//!    fallar con PermissionDenied si msedgewebview2.exe ya tiene file
//!    handles abiertos en el momento del setup callback.
//!
//! 2. Nuclear (cross-platform, fallback): `WebviewWindow::clear_all_browsing_data`.
//!    Borra TODO incluido IndexedDB → user re-loguea Firebase + TinyBase
//!    rehidrata desde Firestore. Garantizado pero molesto.
//!
//! Toda la telemetría va a `purge.log` en `app_local_data_dir()` (append,
//! UNIX epoch ts) además del framework `log::*`. El `purge.log` crudo es
//! defense in depth por si el plugin log falla en release builds.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

const VERSION_FILE: &str = "version.txt";
const PURGE_LOG: &str = "purge.log";

pub fn run(app: &AppHandle) {
    let current = current_version();
    let persisted = read_persisted_version(app);

    log::info!(
        "F7.1: persisted={:?}, current={}",
        persisted.as_deref(),
        current
    );

    if persisted.as_deref() == Some(current) {
        append_purge_log(app, "noop: versions match");
        return;
    }

    append_purge_log(
        app,
        &format!(
            "mismatch detected: persisted={:?}, current={}",
            persisted.as_deref(),
            current
        ),
    );

    perform_purge(app);
    write_current_version(app);
}

fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn version_file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|dir| dir.join(VERSION_FILE))
}

fn purge_log_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|dir| dir.join(PURGE_LOG))
}

fn read_persisted_version(app: &AppHandle) -> Option<String> {
    let path = version_file_path(app)?;
    fs::read_to_string(&path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn write_current_version(app: &AppHandle) {
    let Some(path) = version_file_path(app) else {
        log::warn!("F7.1: cannot resolve version file path");
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Err(err) = fs::write(&path, format!("{}\n", current_version())) {
        log::warn!("F7.1: write_current_version failed: {err}");
    }
}

fn perform_purge(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    {
        match purge_filesystem(app) {
            Ok(()) => {
                append_purge_log(app, "filesystem purge ok (or NotFound)");
                log::warn!("F7.1: filesystem purge succeeded");
                return;
            }
            Err(err) => {
                append_purge_log(
                    app,
                    &format!("filesystem purge failed: {err} — falling back to nuclear"),
                );
                log::warn!("F7.1: filesystem purge failed: {err}");
            }
        }
    }
    purge_nuclear(app);
}

#[cfg(target_os = "windows")]
fn purge_filesystem(app: &AppHandle) -> std::io::Result<()> {
    let data_dir = app.path().app_local_data_dir().map_err(|err| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("app_local_data_dir not resolvable: {err}"),
        )
    })?;
    let sw_dir = data_dir
        .join("EBWebView")
        .join("Default")
        .join("Service Worker");

    match fs::remove_dir_all(&sw_dir) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err),
    }
}

fn purge_nuclear(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        append_purge_log(app, "nuclear fallback failed: main window not found");
        log::error!("F7.1: nuclear fallback — main window not found");
        return;
    };
    match window.clear_all_browsing_data() {
        Ok(()) => {
            append_purge_log(app, "nuclear fallback ok (clear_all_browsing_data)");
            log::warn!("F7.1: nuclear fallback succeeded");
        }
        Err(err) => {
            append_purge_log(app, &format!("nuclear fallback failed: {err}"));
            log::error!("F7.1: nuclear fallback failed: {err}");
        }
    }
}

fn append_purge_log(app: &AppHandle, line: &str) {
    let Some(path) = purge_log_path(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let entry = format!("[ts={ts}] {line}\n");
    let mut file = match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(f) => f,
        Err(_) => return,
    };
    let _ = file.write_all(entry.as_bytes());
}
