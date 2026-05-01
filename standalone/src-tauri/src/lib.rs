use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::{
    collections::HashMap,
    env,
    fs::{create_dir_all, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::Stdio,
    sync::atomic::{AtomicU64, Ordering},
    sync::mpsc,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{AboutMetadata, Menu, PredefinedMenuItem, Submenu},
    AppHandle, DragDropEvent, Emitter, Manager, RunEvent, WindowEvent,
};
use process_wrap::std::*;

enum SidecarMsg {
    Json(String),
    Shutdown,
}

type SidecarSender = mpsc::Sender<SidecarMsg>;
type PendingRequests = Arc<Mutex<HashMap<String, mpsc::Sender<JsonValue>>>>;
type SharedChild = Arc<Mutex<Box<dyn ChildWrapper + Send + Sync>>>;

struct SidecarState {
    tx: SidecarSender,
    pending_requests: PendingRequests,
    next_request_id: AtomicU64,
    child: SharedChild,
}

const LOG_FILE_ENV: &str = "MOUSETERM_LOG_FILE";

fn log_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn default_log_path() -> PathBuf {
    if let Some(path) = env::var_os(LOG_FILE_ENV) {
        return PathBuf::from(path);
    }

    #[cfg(target_os = "windows")]
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        return PathBuf::from(local_app_data)
            .join("MouseTerm")
            .join("mouseterm.log");
    }

    env::temp_dir().join("mouseterm.log")
}

fn init_log() {
    let path = default_log_path();
    if let Some(parent) = path.parent() {
        let _ = create_dir_all(parent);
    }

    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&path)
    {
        let _ = writeln!(
            file,
            "[{}] MouseTerm log started at {}",
            log_timestamp(),
            path.display()
        );
    }
}

fn append_log(message: impl AsRef<str>) {
    let path = default_log_path();
    if let Some(parent) = path.parent() {
        let _ = create_dir_all(parent);
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{}] {}", log_timestamp(), message.as_ref());
    }
}

fn read_log_tail(max_bytes: usize) -> Result<String, String> {
    let path = default_log_path();
    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("read {}: {e}", path.display()))?;
    if contents.len() <= max_bytes {
        return Ok(contents);
    }
    // Slice on a char boundary so we never split a multi-byte sequence.
    let start = contents.len() - max_bytes;
    let start = (start..contents.len())
        .find(|&i| contents.is_char_boundary(i))
        .unwrap_or(contents.len());
    Ok(contents[start..].to_string())
}

#[derive(Serialize, Deserialize, Clone)]
struct PtySpawnOptions {
    cols: Option<u16>,
    rows: Option<u16>,
    cwd: Option<String>,
    shell: Option<String>,
    args: Option<Vec<String>>,
}

fn send_to_sidecar(state: &SidecarState, line: String) {
    let _ = state.tx.send(SidecarMsg::Json(line));
}

fn request_from_sidecar(
    state: &SidecarState,
    event: &str,
    data: JsonValue,
) -> Result<JsonValue, String> {
    request_from_sidecar_timeout(state, event, data, Duration::from_secs(1))
}

fn request_from_sidecar_timeout(
    state: &SidecarState,
    event: &str,
    data: JsonValue,
    timeout: Duration,
) -> Result<JsonValue, String> {
    let request_id = format!(
        "req-{}",
        state.next_request_id.fetch_add(1, Ordering::Relaxed)
    );
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

    match rx.recv_timeout(timeout) {
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
fn pty_spawn(state: tauri::State<'_, SidecarState>, id: String, options: Option<PtySpawnOptions>) {
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
fn pty_resize(state: tauri::State<'_, SidecarState>, id: String, cols: u16, rows: u16) {
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
fn pty_get_cwd(
    state: tauri::State<'_, SidecarState>,
    id: String,
) -> Result<Option<String>, String> {
    let response = request_from_sidecar(&state, "pty:getCwd", serde_json::json!({ "id": id }))?;
    Ok(response
        .get("cwd")
        .and_then(|cwd| cwd.as_str().map(String::from)))
}

#[tauri::command]
fn pty_get_scrollback(
    state: tauri::State<'_, SidecarState>,
    id: String,
) -> Result<Option<String>, String> {
    let response =
        request_from_sidecar(&state, "pty:getScrollback", serde_json::json!({ "id": id }))?;
    Ok(response
        .get("data")
        .and_then(|data| data.as_str().map(String::from)))
}

#[tauri::command]
fn read_clipboard_file_paths(
    state: tauri::State<'_, SidecarState>,
) -> Result<Vec<String>, String> {
    let response =
        request_from_sidecar_timeout(&state, "clipboard:readFiles", serde_json::json!({}), Duration::from_secs(5))?;
    Ok(response
        .get("paths")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default())
}

#[tauri::command]
fn read_clipboard_image_as_file_path(
    state: tauri::State<'_, SidecarState>,
) -> Result<Option<String>, String> {
    let response =
        request_from_sidecar_timeout(&state, "clipboard:readImage", serde_json::json!({}), Duration::from_secs(10))?;
    Ok(response
        .get("path")
        .and_then(|path| path.as_str().map(String::from)))
}

#[tauri::command]
fn read_update_log() -> Result<String, String> {
    read_log_tail(10_000)
}

#[tauri::command]
fn shutdown_sidecar(state: tauri::State<'_, SidecarState>) {
    let _ = state.tx.send(SidecarMsg::Shutdown);
    kill_sidecar(&state.child);
}

/// Kill the sidecar via process-wrap. On Windows the Job Object wrapper
/// guarantees the kill propagates to grandchildren even if the sidecar
/// spawned its own children. On Unix it sends to the whole process group.
fn kill_sidecar(child: &SharedChild) {
    if let Ok(mut guard) = child.lock() {
        append_log(format!("[sidecar] killing (pid={})", guard.id()));
        let _ = guard.start_kill();
    }
}

#[derive(Serialize, Deserialize, Clone)]
struct ShellInfo {
    name: String,
    path: String,
    #[serde(default)]
    args: Vec<String>,
}

#[tauri::command]
fn get_available_shells(state: tauri::State<'_, SidecarState>) -> Result<Vec<ShellInfo>, String> {
    let response = request_from_sidecar_timeout(&state, "pty:getShells", serde_json::json!({}), Duration::from_secs(10))?;
    let shells: Vec<ShellInfo> = response
        .get("shells")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    Ok(shells)
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

fn strip_windows_verbatim_prefix(path_string: &str) -> Option<PathBuf> {
    if let Some(stripped) = path_string.strip_prefix(r"\\?\UNC\") {
        return Some(PathBuf::from(format!(r"\\{stripped}")));
    }
    if let Some(stripped) = path_string.strip_prefix(r"\\?\") {
        return Some(PathBuf::from(stripped));
    }

    None
}

fn sidecar_script_arg_path(path: &Path) -> PathBuf {
    if let Some(path) = strip_windows_verbatim_prefix(&path.to_string_lossy()) {
        return path;
    }

    path.to_path_buf()
}

/// Locate the bundled Node.js binary at runtime. tauri-build/tauri-bundler
/// place externalBin entries alongside the main exe, sometimes with the
/// target-triple suffix (`node-x86_64-pc-windows-msvc.exe`) and sometimes
/// stripped (`node.exe`). Try both, return the first that exists.
fn resolve_node_binary_path() -> Result<PathBuf, String> {
    let exe = env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "current_exe has no parent".to_string())?;
    Ok(find_node_binary(dir, env!("TAURI_ENV_TARGET_TRIPLE"))
        .ok_or_else(|| format!("node sidecar not found in {}", dir.display()))?)
}

fn find_node_binary(dir: &Path, target_triple: &str) -> Option<PathBuf> {
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    let candidates = [
        dir.join(format!("node-{target_triple}{suffix}")),
        dir.join(format!("node{suffix}")),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

fn start_sidecar(app: &AppHandle) -> Result<SidecarState, String> {
    let sidecar_path = resolve_sidecar_path(
        app.path().resource_dir().ok(),
        Path::new(env!("CARGO_MANIFEST_DIR")),
    );
    let sidecar_arg_path = sidecar_script_arg_path(&sidecar_path);
    let node_path = resolve_node_binary_path()?;
    append_log(format!(
        "[sidecar] resolved script: {}",
        sidecar_path.display()
    ));
    append_log(format!(
        "[sidecar] script argument: {}",
        sidecar_arg_path.display()
    ));
    append_log(format!("[sidecar] node binary: {}", node_path.display()));

    let mut wrap = CommandWrap::with_new(&node_path, |c| {
        c.arg(&sidecar_arg_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
    });
    #[cfg(windows)]
    {
        wrap.wrap(JobObject);
    }
    #[cfg(unix)]
    {
        wrap.wrap(ProcessGroup::leader());
    }

    let mut child = wrap
        .spawn()
        .map_err(|err| format!("failed to start Node.js sidecar: {err}"))?;
    let child_pid = child.id();
    append_log(format!("[sidecar] spawned Node.js runtime (pid={child_pid})"));

    let stdin = child
        .stdin()
        .take()
        .ok_or_else(|| "sidecar stdin missing".to_string())?;
    let stdout = child
        .stdout()
        .take()
        .ok_or_else(|| "sidecar stdout missing".to_string())?;
    let stderr = child
        .stderr()
        .take()
        .ok_or_else(|| "sidecar stderr missing".to_string())?;

    let handle = app.clone();
    let pending_requests: PendingRequests = Arc::new(Mutex::new(HashMap::new()));
    let pending_requests_for_task = Arc::clone(&pending_requests);

    // ── stdout reader thread ────────────────────────────────────────────
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line_result in reader.lines() {
            let Ok(line) = line_result else {
                break;
            };
            let Ok(mut msg) = serde_json::from_str::<JsonValue>(&line) else {
                append_log(format!("[sidecar stdout] {}", line.trim_end()));
                continue;
            };
            let Some(event) = msg.get("event").and_then(|e| e.as_str()).map(String::from)
            else {
                append_log("[sidecar stdout] JSON line missing event");
                continue;
            };
            let data = msg
                .as_object_mut()
                .and_then(|m| m.remove("data"))
                .unwrap_or(JsonValue::Null);

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
    });

    // ── stderr reader thread ────────────────────────────────────────────
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line_result in reader.lines() {
            let Ok(line) = line_result else {
                break;
            };
            let message = format!("[sidecar] {}", line.trim_end());
            eprintln!("{message}");
            append_log(message);
        }
    });

    // ── stdin writer thread ─────────────────────────────────────────────
    let (tx, writer_rx) = mpsc::channel::<SidecarMsg>();
    let mut stdin = stdin;

    std::thread::spawn(move || {
        while let Ok(msg) = writer_rx.recv() {
            match msg {
                SidecarMsg::Shutdown => {
                    append_log("[sidecar] shutdown requested");
                    break;
                }
                SidecarMsg::Json(line) => {
                    let payload = format!("{}\n", line);
                    if stdin.write_all(payload.as_bytes()).is_err() {
                        append_log("[sidecar] stdin write failed");
                        break;
                    }
                }
            }
        }
    });

    let child: SharedChild = Arc::new(Mutex::new(child));

    Ok(SidecarState {
        tx,
        pending_requests,
        next_request_id: AtomicU64::new(0),
        child,
    })
}

// ── App entry point ─────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Replace Tauri's default menu, which binds Cmd+V to a native Paste
        // action that fights with the webview's DOM keydown handler. The
        // terminal owns Cmd+C / Cmd+V / Cmd+X in JS (see `Wall.tsx`).
        .menu(|handle| {
            let pkg = handle.package_info();
            let about = AboutMetadata {
                name: Some(pkg.name.clone()),
                version: Some(pkg.version.to_string()),
                ..Default::default()
            };
            let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<_>>> = Vec::new();
            #[cfg(target_os = "macos")]
            items.push(Box::new(Submenu::with_items(
                handle,
                pkg.name.clone(),
                true,
                &[
                    &PredefinedMenuItem::about(handle, None, Some(about))?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::services(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::hide(handle, None)?,
                    &PredefinedMenuItem::hide_others(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?));
            items.push(Box::new(Submenu::with_items(
                handle,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(handle, None)?,
                    &PredefinedMenuItem::maximize(handle, None)?,
                    #[cfg(target_os = "macos")]
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::close_window(handle, None)?,
                ],
            )?));
            let refs: Vec<&dyn tauri::menu::IsMenuItem<_>> = items.iter().map(|b| b.as_ref()).collect();
            Menu::with_items(handle, &refs)
        })
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                let payload: Vec<String> = paths
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                let _ = window.emit("mouseterm://files-dropped", serde_json::json!({ "paths": payload }));
            }
        })
        .setup(|app| {
            init_log();
            append_log("[app] setup started");

            let sidecar_state = start_sidecar(app.handle()).map_err(|err| {
                append_log(format!("[sidecar] {err}"));
                std::io::Error::new(std::io::ErrorKind::Other, err)
            })?;
            app.manage(sidecar_state);
            append_log("[app] sidecar state registered");

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
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            pty_get_cwd,
            pty_get_scrollback,
            pty_request_init,
            shutdown_sidecar,
            get_available_shells,
            read_clipboard_file_paths,
            read_clipboard_image_as_file_path,
            read_update_log,
        ])
        .build(tauri::generate_context!())
        .expect("error while building MouseTerm")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<SidecarState>() {
                    append_log("[app] exit — killing sidecar");
                    let _ = state.tx.send(SidecarMsg::Shutdown);
                    kill_sidecar(&state.child);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::{find_node_binary, resolve_sidecar_path, strip_windows_verbatim_prefix};
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

        assert_eq!(
            resolved,
            manifest_dir.join("..").join("sidecar").join("main.js")
        );
    }

    #[test]
    fn strips_windows_verbatim_prefix_for_node_main_script() {
        let path = strip_windows_verbatim_prefix(
            r"\\?\C:\Users\EdgarTwigg\AppData\Local\MouseTerm\_up_\sidecar\main.js",
        )
        .expect("expected verbatim path to be stripped");

        assert_eq!(
            path,
            PathBuf::from(r"C:\Users\EdgarTwigg\AppData\Local\MouseTerm\_up_\sidecar\main.js")
        );
    }

    #[test]
    fn strips_windows_verbatim_unc_prefix_for_node_main_script() {
        let path = strip_windows_verbatim_prefix(r"\\?\UNC\server\share\MouseTerm\sidecar\main.js")
            .expect("expected verbatim UNC path to be stripped");

        assert_eq!(
            path,
            PathBuf::from(r"\\server\share\MouseTerm\sidecar\main.js")
        );
    }

    #[test]
    fn finds_node_binary_with_triple_suffix() {
        let dir = unique_temp_dir("node-triple");
        fs::create_dir_all(&dir).expect("failed to create dir");
        let suffix = if cfg!(windows) { ".exe" } else { "" };
        let triple = "x86_64-pc-windows-msvc";
        let expected = dir.join(format!("node-{triple}{suffix}"));
        fs::write(&expected, b"fake").expect("failed to write fake binary");

        let resolved = find_node_binary(&dir, triple).expect("should resolve");
        assert_eq!(resolved, expected);
        fs::remove_dir_all(&dir).expect("failed to clean temp dir");
    }

    #[test]
    fn finds_node_binary_falls_back_to_stripped_name() {
        let dir = unique_temp_dir("node-stripped");
        fs::create_dir_all(&dir).expect("failed to create dir");
        let suffix = if cfg!(windows) { ".exe" } else { "" };
        let expected = dir.join(format!("node{suffix}"));
        fs::write(&expected, b"fake").expect("failed to write fake binary");

        let resolved = find_node_binary(&dir, "x86_64-pc-windows-msvc").expect("should resolve");
        assert_eq!(resolved, expected);
        fs::remove_dir_all(&dir).expect("failed to clean temp dir");
    }

    #[test]
    fn returns_none_when_no_node_binary_present() {
        let dir = unique_temp_dir("node-missing");
        fs::create_dir_all(&dir).expect("failed to create dir");

        assert!(find_node_binary(&dir, "x86_64-pc-windows-msvc").is_none());
        fs::remove_dir_all(&dir).expect("failed to clean temp dir");
    }
}
