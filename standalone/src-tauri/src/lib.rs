use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

enum SidecarMsg {
    Json(String),
    Shutdown,
}

type SidecarSender = mpsc::Sender<SidecarMsg>;
type PendingRequests = Arc<Mutex<HashMap<String, mpsc::Sender<JsonValue>>>>;

struct SidecarState {
    tx: SidecarSender,
    pending_requests: PendingRequests,
    next_request_id: AtomicU64,
}

#[derive(Serialize, Deserialize, Clone)]
struct PtySpawnOptions {
    cols: Option<u16>,
    rows: Option<u16>,
    cwd: Option<String>,
}

fn send_to_sidecar(state: &SidecarState, line: String) {
    let _ = state.tx.send(SidecarMsg::Json(line));
}

fn request_from_sidecar(
    state: &SidecarState,
    event: &str,
    data: JsonValue,
) -> Result<JsonValue, String> {
    let request_id = format!("req-{}", state.next_request_id.fetch_add(1, Ordering::Relaxed));
    let (tx, rx) = mpsc::channel();
    state
        .pending_requests
        .lock()
        .map_err(|_| "failed to lock pending request map".to_string())?
        .insert(request_id.clone(), tx);

    let mut payload = match data {
        JsonValue::Object(map) => map,
        _ => JsonMap::new(),
    };
    payload.insert("requestId".into(), JsonValue::String(request_id.clone()));

    let msg = serde_json::json!({
        "event": event,
        "data": JsonValue::Object(payload)
    });
    send_to_sidecar(state, msg.to_string());

    match rx.recv_timeout(Duration::from_secs(1)) {
        Ok(response) => Ok(response),
        Err(_) => {
            if let Ok(mut pending) = state.pending_requests.lock() {
                pending.remove(&request_id);
            }
            Err(format!("timed out waiting for {event}"))
        }
    }
}

// ── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn pty_spawn(
    state: tauri::State<'_, SidecarState>,
    id: String,
    options: Option<PtySpawnOptions>,
) {
    let msg = serde_json::json!({
        "event": "pty:spawn",
        "data": { "id": id, "options": options }
    });
    send_to_sidecar(&state, msg.to_string());
}

#[tauri::command]
fn pty_write(state: tauri::State<'_, SidecarState>, id: String, data: String) {
    let msg = serde_json::json!({
        "event": "pty:input",
        "data": { "id": id, "data": data }
    });
    send_to_sidecar(&state, msg.to_string());
}

#[tauri::command]
fn pty_resize(
    state: tauri::State<'_, SidecarState>,
    id: String,
    cols: u16,
    rows: u16,
) {
    let msg = serde_json::json!({
        "event": "pty:resize",
        "data": { "id": id, "cols": cols, "rows": rows }
    });
    send_to_sidecar(&state, msg.to_string());
}

#[tauri::command]
fn pty_kill(state: tauri::State<'_, SidecarState>, id: String) {
    let msg = serde_json::json!({
        "event": "pty:kill",
        "data": { "id": id }
    });
    send_to_sidecar(&state, msg.to_string());
}

#[tauri::command]
fn pty_request_init(state: tauri::State<'_, SidecarState>) {
    let msg = serde_json::json!({ "event": "pty:requestInit" });
    send_to_sidecar(&state, msg.to_string());
}

#[tauri::command]
fn pty_get_cwd(state: tauri::State<'_, SidecarState>, id: String) -> Result<Option<String>, String> {
    let response = request_from_sidecar(&state, "pty:getCwd", serde_json::json!({ "id": id }))?;
    Ok(response
        .get("cwd")
        .and_then(|cwd| cwd.as_str().map(String::from)))
}

#[tauri::command]
fn pty_get_scrollback(state: tauri::State<'_, SidecarState>, id: String) -> Result<Option<String>, String> {
    let response = request_from_sidecar(&state, "pty:getScrollback", serde_json::json!({ "id": id }))?;
    Ok(response
        .get("data")
        .and_then(|data| data.as_str().map(String::from)))
}

#[tauri::command]
fn shutdown_sidecar(state: tauri::State<'_, SidecarState>) {
    let _ = state.tx.send(SidecarMsg::Shutdown);
}

#[tauri::command]
fn get_project_dir() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default()
}

#[derive(Serialize, Clone)]
struct ShellInfo {
    name: String,
    path: String,
}

#[tauri::command]
fn get_default_shell() -> ShellInfo {
    #[cfg(target_os = "windows")]
    let shell_path = std::env::var("ComSpec")
        .or_else(|_| std::env::var("COMSPEC"))
        .unwrap_or_else(|_| String::from("C:\\Windows\\System32\\cmd.exe"));

    #[cfg(not(target_os = "windows"))]
    let shell_path = std::env::var("SHELL")
        .unwrap_or_else(|_| String::from("/bin/sh"));

    let name = Path::new(&shell_path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| shell_path.clone());

    ShellInfo { name, path: shell_path }
}

fn resolve_sidecar_path(resource_dir: Option<PathBuf>, manifest_dir: &Path) -> PathBuf {
    if let Some(ref dir) = resource_dir {
        // Tauri maps `../sidecar` to `_up_/sidecar` when bundling resources
        for prefix in &["sidecar", "_up_/sidecar"] {
            let path = dir.join(prefix).join("main.js");
            if path.is_file() {
                return path;
            }
        }
    }

    manifest_dir.join("..").join("sidecar").join("main.js")
}

fn start_sidecar(app: &AppHandle) -> SidecarState {
    let sidecar_path = resolve_sidecar_path(
        app.path().resource_dir().ok(),
        Path::new(env!("CARGO_MANIFEST_DIR")),
    );

    let (mut rx, mut child) = app
        .shell()
        .sidecar("node")
        .expect("failed to resolve bundled Node.js runtime")
        .arg(&sidecar_path)
        .set_raw_out(false)
        .spawn()
        .expect("failed to start Node.js sidecar");

    let handle = app.clone();
    let pending_requests: PendingRequests = Arc::new(Mutex::new(HashMap::new()));
    let pending_requests_for_task = Arc::clone(&pending_requests);

    // ── stdout/stderr reader task ───────────────────────────────────────
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let Ok(line) = String::from_utf8(line) else { continue };
                    let Ok(mut msg) = serde_json::from_str::<serde_json::Value>(&line) else {
                        continue;
                    };
                    let Some(event) = msg.get("event").and_then(|e| e.as_str()).map(String::from) else {
                        continue;
                    };
                    let data = msg.as_object_mut()
                        .and_then(|m| m.remove("data"))
                        .unwrap_or(serde_json::Value::Null);

                    if let Some(request_id) = data
                        .get("requestId")
                        .and_then(|request_id| request_id.as_str())
                    {
                        if let Ok(mut pending) = pending_requests_for_task.lock() {
                            if let Some(response_tx) = pending.remove(request_id) {
                                let _ = response_tx.send(data.clone());
                                continue;
                            }
                        }
                    }

                    let _ = handle.emit(&event, data);
                }
                CommandEvent::Stderr(line) => {
                    if let Ok(line) = String::from_utf8(line) {
                        eprintln!("[sidecar] {}", line.trim_end());
                    }
                }
                CommandEvent::Error(err) => {
                    eprintln!("[sidecar] {}", err);
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!(
                        "[sidecar] exited (code: {:?}, signal: {:?})",
                        payload.code,
                        payload.signal
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    // ── stdin writer thread ─────────────────────────────────────────────
    let (tx, writer_rx) = mpsc::channel::<SidecarMsg>();

    std::thread::spawn(move || {
        while let Ok(msg) = writer_rx.recv() {
            match msg {
                SidecarMsg::Shutdown => break,
                SidecarMsg::Json(line) => {
                    let payload = format!("{}\n", line);
                    if child.write(payload.as_bytes()).is_err() {
                        break;
                    }
                }
            }
        }
    });

    SidecarState {
        tx,
        pending_requests,
        next_request_id: AtomicU64::new(0),
    }
}

// ── App entry point ─────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let sidecar_state = start_sidecar(app.handle());
            app.manage(sidecar_state);

            // On non-macOS, remove native decorations for a fully custom title bar.
            // macOS uses titleBarStyle "Overlay" from config instead, which preserves
            // rounded corners and native traffic-light buttons.
            #[cfg(not(target_os = "macos"))]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(false);
                }
            }

            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                std::process::exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            pty_get_cwd,
            pty_get_scrollback,
            pty_request_init,
            shutdown_sidecar,
            get_project_dir,
            get_default_shell,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MouseTerm");
}

#[cfg(test)]
mod tests {
    use super::resolve_sidecar_path;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("mouseterm-{name}-{suffix}"))
    }

    #[test]
    fn prefers_packaged_sidecar_when_resource_exists() {
        let resource_dir = unique_temp_dir("resource");
        let sidecar_dir = resource_dir.join("sidecar");
        let sidecar_path = sidecar_dir.join("main.js");

        fs::create_dir_all(&sidecar_dir).expect("failed to create sidecar dir");
        fs::write(&sidecar_path, "console.log('packaged');").expect("failed to create sidecar");

        let resolved = resolve_sidecar_path(
            Some(resource_dir.clone()),
            Path::new("/repo/standalone/src-tauri"),
        );

        assert_eq!(resolved, sidecar_path);
        fs::remove_dir_all(&resource_dir).expect("failed to clean temp dir");
    }

    #[test]
    fn finds_sidecar_under_up_prefix() {
        let resource_dir = unique_temp_dir("resource-up");
        let sidecar_dir = resource_dir.join("_up_").join("sidecar");
        let sidecar_path = sidecar_dir.join("main.js");

        fs::create_dir_all(&sidecar_dir).expect("failed to create sidecar dir");
        fs::write(&sidecar_path, "console.log('packaged');").expect("failed to create sidecar");

        let resolved = resolve_sidecar_path(
            Some(resource_dir.clone()),
            Path::new("/repo/standalone/src-tauri"),
        );

        assert_eq!(resolved, sidecar_path);
        fs::remove_dir_all(&resource_dir).expect("failed to clean temp dir");
    }

    #[test]
    fn falls_back_to_repo_sidecar_when_resource_is_missing() {
        let manifest_dir = Path::new("/repo/standalone/src-tauri");

        let resolved = resolve_sidecar_path(None, manifest_dir);

        assert_eq!(resolved, manifest_dir.join("..").join("sidecar").join("main.js"));
    }
}
