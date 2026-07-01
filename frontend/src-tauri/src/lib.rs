//! Pitwall IQ desktop shell.
//!
//! Responsibilities:
//!   * Launch the FastAPI backend automatically (dev: system Python running the
//!     source; release: the bundled PyInstaller sidecar next to the app binary).
//!   * Keep the window hidden until the backend's /health endpoint answers, then
//!     reveal the UI — the user never sees a blank page or touches a terminal.
//!   * Cleanly stop the backend when the app quits.
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WindowEvent};

/// The sidecar always listens here (see backend/desktop_server.py and the
/// frontend api.ts DESKTOP_API_BASE). Deliberately not 8000 so a dev backend can
/// run alongside a packaged app without a port clash.
const BACKEND_PORT: u16 = 8765;
const HEALTH_TIMEOUT: Duration = Duration::from_secs(40);

/// Holds the backend child process so we can stop it on exit.
struct BackendState(Mutex<Option<Child>>);

fn spawn_backend() -> std::io::Result<Child> {
    let port = BACKEND_PORT.to_string();

    if cfg!(debug_assertions) {
        // Desktop dev: run the source backend with the system Python. No
        // PyInstaller build required for the dev loop.
        let python = std::env::var("PITWALL_IQ_PYTHON").unwrap_or_else(|_| "python3".into());
        let backend_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../backend");
        eprintln!("[pitwall-iq] dev backend: {python} -m uvicorn (port {port})");
        Command::new(python)
            .args([
                "-m", "uvicorn", "app.main:app",
                "--host", "127.0.0.1", "--port", &port,
            ])
            .current_dir(backend_dir)
            .spawn()
    } else {
        // Packaged app: the bundled sidecar sits next to the app executable
        // (Tauri copies externalBin into Contents/MacOS/, stripped of the triple).
        let exe = std::env::current_exe()?;
        let dir = exe.parent().expect("executable has no parent directory");
        let name = if cfg!(windows) { "pitwall-iq-backend.exe" } else { "pitwall-iq-backend" };
        let sidecar = dir.join(name);
        eprintln!("[pitwall-iq] sidecar: {} (port {port})", sidecar.display());
        Command::new(sidecar).args(["--port", &port]).spawn()
    }
}

/// Poll the backend until /health answers or we time out.
fn wait_for_health(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if health_ok(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    false
}

/// A dependency-free HTTP/1.1 GET /health over raw TCP (localhost only).
fn health_ok(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(900)));
    let req = "GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = String::new();
    let _ = stream.read_to_string(&mut buf);
    buf.contains("200") && buf.contains("pitwall-iq-backend")
}

fn stop_backend(app: &tauri::AppHandle) {
    if let Some(mut child) = app.state::<BackendState>().0.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackendState(Mutex::new(None)))
        .setup(|app| {
            match spawn_backend() {
                Ok(child) => {
                    *app.state::<BackendState>().0.lock().unwrap() = Some(child);
                }
                Err(e) => eprintln!("[pitwall-iq] failed to start backend: {e}"),
            }

            // Reveal the window only once the backend is answering (or we give up).
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                if !wait_for_health(BACKEND_PORT, HEALTH_TIMEOUT) {
                    eprintln!("[pitwall-iq] backend health timed out; showing UI anyway");
                }
                if let Some(win) = handle.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            // Single-window utility: closing the window quits the app (and the backend).
            if let WindowEvent::CloseRequested { .. } = event {
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Pitwall IQ")
        .run(|handle, event| {
            if let RunEvent::Exit = event {
                stop_backend(handle);
            }
        });
}
