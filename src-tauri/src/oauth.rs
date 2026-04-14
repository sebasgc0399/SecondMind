use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use tauri::{AppHandle, Emitter};

const RESPONSE_HTML: &str = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>SecondMind</title><style>body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}main{text-align:center}h1{color:#a855f7;font-size:2rem;margin-bottom:.5rem}p{color:#a1a1aa}</style></head><body><main><h1>SecondMind</h1><p>Autenticación completada. Ya podés cerrar esta ventana.</p></main><script>window.close();</script></body></html>";

#[tauri::command]
pub async fn start_oauth_listener(app: AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    std::thread::spawn(move || {
        if let Ok((stream, _)) = listener.accept() {
            handle_connection(stream, port, &app);
        }
    });

    Ok(port)
}

fn handle_connection(mut stream: std::net::TcpStream, port: u16, app: &AppHandle) {
    let mut request_line = String::new();
    {
        let mut reader = BufReader::new(&stream);
        if reader.read_line(&mut request_line).is_err() {
            return;
        }
    }

    if let Some(path) = request_line.split_whitespace().nth(1) {
        let full_url = format!("http://127.0.0.1:{port}{path}");
        let _ = app.emit("oauth://callback", full_url);
    }

    let _ = stream.write_all(RESPONSE_HTML.as_bytes());
    let _ = stream.flush();
}
