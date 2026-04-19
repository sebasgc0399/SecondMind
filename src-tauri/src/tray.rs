use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, WebviewWindow,
};
use tauri_plugin_autostart::ManagerExt;

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let autostart_enabled = app
        .autolaunch()
        .is_enabled()
        .unwrap_or(false);

    let open_item = MenuItemBuilder::with_id("open", "Abrir SecondMind").build(app)?;
    let capture_item = MenuItemBuilder::with_id("capture", "Captura rápida").build(app)?;
    let separator_1 = PredefinedMenuItem::separator(app)?;
    let autostart_item = CheckMenuItemBuilder::with_id("autostart", "Iniciar con Windows")
        .checked(autostart_enabled)
        .build(app)?;
    let separator_2 = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Salir").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[
            &open_item,
            &capture_item,
            &separator_1,
            &autostart_item,
            &separator_2,
            &quit_item,
        ])
        .build()?;

    let icon = app
        .default_window_icon()
        .cloned()
        .expect("default window icon debería existir tras tauri init");

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("SecondMind")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "capture" => show_capture(app),
            "autostart" => toggle_autostart(app, &autostart_item),
            "quit" => app.exit(0),
            _ => (),
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    match window.is_visible() {
        Ok(true) => {
            let _ = window.hide();
        }
        _ => {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn show_capture(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("capture") {
        let _ = center_on_cursor_monitor(&window);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn center_on_cursor_monitor(window: &WebviewWindow) -> tauri::Result<()> {
    let cursor = window.cursor_position()?;
    let monitors = window.available_monitors()?;
    let target = monitors
        .iter()
        .find(|m| {
            let pos = m.position();
            let size = m.size();
            cursor.x >= pos.x as f64
                && cursor.x < (pos.x + size.width as i32) as f64
                && cursor.y >= pos.y as f64
                && cursor.y < (pos.y + size.height as i32) as f64
        })
        .or_else(|| monitors.first());

    if let Some(monitor) = target {
        let win_size = window.outer_size()?;
        let mpos = monitor.position();
        let msize = monitor.size();
        let cx = mpos.x + (msize.width as i32 - win_size.width as i32) / 2;
        let cy = mpos.y + (msize.height as i32 - win_size.height as i32) / 2;
        window.set_position(PhysicalPosition { x: cx, y: cy })?;
    }
    Ok(())
}

fn toggle_autostart(app: &AppHandle, item: &tauri::menu::CheckMenuItem<tauri::Wry>) {
    let manager = app.autolaunch();
    let enabled = manager.is_enabled().unwrap_or(false);
    let result = if enabled {
        manager.disable()
    } else {
        manager.enable()
    };
    match result {
        Ok(()) => {
            let _ = item.set_checked(!enabled);
        }
        Err(err) => {
            log::error!("autostart toggle failed: {err}");
        }
    }
}
