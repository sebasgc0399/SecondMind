mod oauth;
mod tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["capture"])
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![oauth::start_oauth_listener])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            tray::build(app.handle())?;

            // Global shortcut registrado Rust-side (movido desde JS en fix post-F7).
            // Motivo: el hook JS se montaba en ambas ventanas (main + capture) por
            // compartir main.tsx, causando double-register race. El callback final
            // quedaba registrado en el contexto de la ventana capture operando
            // sobre sí misma en hidden state, lo que en Windows tiene quirks
            // conocidos (issue tauri-apps/tauri#6843). Rust garantiza un único
            // registro con contexto AppHandle estable.
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                let capture_shortcut =
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            if shortcut == &capture_shortcut
                                && event.state() == ShortcutState::Pressed
                            {
                                tray::show_capture(app);
                            }
                        })
                        .build(),
                )?;
                app.global_shortcut().register(capture_shortcut)?;
            }

            // DevTools auto-open en debug builds. La feature `devtools` está
            // habilitada en Cargo.toml de forma incondicional (Cargo no soporta
            // cfg(debug_assertions) en [dependencies]), pero la invocación está
            // gated: en release builds este bloque no se compila, así que la
            // API runtime nunca se llama y no hay shortcut que la dispare.
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
