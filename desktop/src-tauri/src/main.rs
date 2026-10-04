//! WiFi Heatmapper desktop shell.
//!
//! Runs the same Next.js server as `npm start`, from the copy bundled in the
//! app (`<resources>/server`, assembled by `desktop/build-server.mjs`), and
//! points a window at it. The window first shows `../launcher/index.html`,
//! which asks `server_status` until the server answers and then navigates to
//! it, or shows the server's last output if it dies.
//!
//! The contract with the server (later parts rely on it):
//!
//! - command: `<server>/node[.exe] server-entry.mjs`, cwd `<server>`, stdin a
//!   pipe this process holds (the server exits when it closes);
//! - `PORT` (free port, or `WIFI_HEATMAPPER_PORT`), `HOSTNAME=127.0.0.1`,
//!   `NODE_ENV=production`;
//! - `WIFI_HEATMAPPER_DATA_DIR=<app data dir>/data` unless already set;
//! - `WIFI_HEATMAPPER_RESOURCES_DIR=<server>` (read-only; `helpers/` lives here);
//! - `PATH` plus the usual package-manager dirs, because an app opened from
//!   Finder gets a bare PATH and would not find a Homebrew `iperf3`;
//! - everything else is inherited (so `WIFI_HEATMAPPER_MOCK=1` passes through).
//!
//! The server's stdout and stderr go to `<app log dir>/server.log`.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::VecDeque;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};

const WINDOW_TITLE: &str = "WiFi Heatmapper";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(45);
const POLL: Duration = Duration::from_millis(150);
/// A Node stack trace is about twenty lines; keep a little more.
const STDERR_TAIL_LINES: usize = 40;
/// How long a server gets to stop on SIGTERM before it is killed.
const STOP_GRACE: Duration = Duration::from_secs(3);

#[cfg(windows)]
const EXE: &str = ".exe";
#[cfg(not(windows))]
const EXE: &str = "";

/// Added to the end of PATH if missing: where package managers put iperf3
/// (and, on Linux, `iw`), which an app started from the desktop doesn't see.
#[cfg(target_os = "macos")]
const EXTRA_PATH: &[&str] = &["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/sbin", "/sbin"];
#[cfg(all(unix, not(target_os = "macos")))]
const EXTRA_PATH: &[&str] = &["/usr/local/bin", "/usr/sbin", "/sbin"];
#[cfg(windows)]
const EXTRA_PATH: &[&str] = &[];

/// The launcher page's origin, to navigate back to it if the server dies.
#[cfg(windows)]
const LAUNCHER_URL: &str = "http://tauri.localhost/index.html";
#[cfg(not(windows))]
const LAUNCHER_URL: &str = "tauri://localhost/index.html";

/// What the launcher page is told. Shape shared with `../launcher/index.html`.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
enum ServerStatus {
    Starting,
    Ready { url: String },
    SpawnFailed { error: String, log: String },
    Exited { code: Option<i32>, stderr: String, log: String },
    TimedOut { stderr: String, log: String },
}

/// The last lines the server wrote to stderr.
#[derive(Default)]
struct StderrTail(Mutex<VecDeque<String>>);

impl StderrTail {
    fn push(&self, line: &[u8]) {
        let text = String::from_utf8_lossy(line).trim_end().to_string();
        let mut lines = self.0.lock().unwrap();
        if lines.len() == STDERR_TAIL_LINES {
            lines.pop_front();
        }
        lines.push_back(text);
    }

    fn text(&self) -> String {
        self.0.lock().unwrap().iter().cloned().collect::<Vec<_>>().join("\n")
    }
}

struct Server {
    child: Mutex<Option<Child>>,
    status: Mutex<ServerStatus>,
    tail: Arc<StderrTail>,
    quitting: AtomicBool,
    log_path: Mutex<Option<PathBuf>>,
}

impl Server {
    fn log(&self) -> String {
        self.log_path
            .lock()
            .unwrap()
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_default()
    }

    fn set(&self, status: ServerStatus) {
        *self.status.lock().unwrap() = status;
    }
}

#[tauri::command]
fn server_status(server: tauri::State<'_, Server>) -> ServerStatus {
    server.status.lock().unwrap().clone()
}

/// "Try again" on the launcher: quit (stopping the server) and start over.
#[tauri::command]
fn relaunch(app: tauri::AppHandle) {
    app.restart();
}

/// "Show log file" on the launcher.
#[tauri::command]
fn reveal_log(server: tauri::State<'_, Server>) {
    if let Some(path) = server.log_path.lock().unwrap().as_ref() {
        reveal(path);
    }
}

/// Copy the server's stderr to the tail, the log file and our own stderr (so a
/// terminal launch still shows it). Must keep reading until EOF: a child whose
/// stderr pipe fills up blocks.
fn pump_stderr(reader: impl Read, tail: &StderrTail, mut log: Option<File>) {
    let mut reader = BufReader::new(reader);
    let mut line = Vec::new();
    loop {
        line.clear();
        match reader.read_until(b'\n', &mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                let _ = std::io::stderr().write_all(&line);
                if let Some(f) = log.as_mut() {
                    let _ = f.write_all(&line);
                }
                tail.push(&line);
            }
        }
    }
}

fn free_port() -> std::io::Result<u16> {
    if let Some(port) = std::env::var("WIFI_HEATMAPPER_PORT").ok().and_then(|p| p.parse().ok()) {
        return Ok(port);
    }
    Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port())
}

/// Does the server answer HTTP yet? The port is one we just picked, so any 200
/// from /api/status is ours.
fn answers(port: u16) -> bool {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(300)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let request =
        format!("GET /api/status HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut head = [0u8; 16];
    let n = (&mut stream).read(&mut head).unwrap_or(0);
    let _ = stream.shutdown(Shutdown::Both);
    head[..n].starts_with(b"HTTP/1.1 200")
}

fn path_with_extras() -> std::ffi::OsString {
    let current = std::env::var_os("PATH").unwrap_or_default();
    let mut dirs: Vec<PathBuf> = std::env::split_paths(&current).collect();
    for extra in EXTRA_PATH {
        let extra = PathBuf::from(extra);
        if !dirs.contains(&extra) {
            dirs.push(extra);
        }
    }
    std::env::join_paths(dirs).unwrap_or(current)
}

fn spawn_server(
    server_dir: &Path,
    data_dir: &Path,
    port: u16,
    log: Option<&File>,
    tail: Arc<StderrTail>,
) -> std::io::Result<Child> {
    std::fs::create_dir_all(data_dir)?;
    let mut command = Command::new(server_dir.join(format!("node{EXE}")));
    command
        .arg("server-entry.mjs")
        .current_dir(server_dir)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .env("WIFI_HEATMAPPER_DATA_DIR", data_dir)
        .env("WIFI_HEATMAPPER_RESOURCES_DIR", server_dir)
        .env("PATH", path_with_extras())
        .stdin(Stdio::piped())
        .stdout(match log.and_then(|f| f.try_clone().ok()) {
            Some(f) => Stdio::from(f),
            None => Stdio::inherit(),
        })
        .stderr(Stdio::piped());
    // Own process group, so quitting can stop the server and whatever it is
    // running at the moment (iperf3, wdutil) in one go.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    // node.exe is a console program; without this Windows opens a console window.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn()?;
    if let Some(stderr) = child.stderr.take() {
        let log = log.and_then(|f| f.try_clone().ok());
        std::thread::spawn(move || pump_stderr(stderr, &tail, log));
    }
    Ok(child)
}

/// Wait for the server to answer, then keep watching it: if it exits at any
/// point (and the app is not quitting), report that and go back to the launcher.
fn watch(app: tauri::AppHandle, port: u16) {
    let server = app.state::<Server>();
    let started = Instant::now();
    let mut ready = false;
    loop {
        let exit = {
            let mut guard = server.child.lock().unwrap();
            let Some(child) = guard.as_mut() else { return };
            match child.try_wait() {
                Ok(Some(status)) => Some(status.code()),
                Ok(None) => None,
                Err(_) => Some(None),
            }
        };
        if server.quitting.load(Ordering::SeqCst) {
            return;
        }
        if let Some(code) = exit {
            // give the stderr pump a moment to read the last words
            std::thread::sleep(Duration::from_millis(300));
            eprintln!("wifi-heatmapper: the server exited (code {code:?})");
            server.set(ServerStatus::Exited { code, stderr: server.tail.text(), log: server.log() });
            if ready {
                if let (Some(window), Ok(url)) =
                    (app.get_webview_window("main"), Url::parse(LAUNCHER_URL))
                {
                    let _ = window.navigate(url);
                }
            }
            return;
        }
        if !ready {
            if answers(port) {
                ready = true;
                server.set(ServerStatus::Ready { url: format!("http://127.0.0.1:{port}/") });
            } else if started.elapsed() > STARTUP_TIMEOUT {
                server.set(ServerStatus::TimedOut { stderr: server.tail.text(), log: server.log() });
            }
        }
        std::thread::sleep(if ready { Duration::from_millis(500) } else { POLL });
    }
}

/// Stop the server and anything it started.
fn stop(mut child: Child) {
    #[cfg(unix)]
    {
        let group = -(child.id() as i32);
        unsafe { libc::kill(group, libc::SIGTERM) };
        let deadline = Instant::now() + STOP_GRACE;
        while Instant::now() < deadline {
            if let Ok(Some(_)) = child.try_wait() {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        // the group may outlive its leader (an iperf3 still finishing)
        unsafe { libc::kill(group, libc::SIGKILL) };
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn open_in_browser(url: &str) {
    let Ok(parsed) = Url::parse(url) else { return };
    if !matches!(parsed.scheme(), "http" | "https" | "mailto") {
        return;
    }
    open_with_system(parsed.as_str(), false);
}

/// Show a file in Finder / Explorer / the file manager.
fn reveal(path: &Path) {
    #[cfg(target_os = "linux")]
    let path = path.parent().unwrap_or(path);
    open_with_system(&path.to_string_lossy(), true);
}

fn open_with_system(target: &str, select: bool) {
    #[cfg(target_os = "macos")]
    let spawned = if select {
        Command::new("open").arg("-R").arg(target).spawn()
    } else {
        Command::new("open").arg(target).spawn()
    };
    #[cfg(windows)]
    let spawned = if select {
        Command::new("explorer").arg(format!("/select,{target}")).spawn()
    } else {
        Command::new("explorer").arg(target).spawn()
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let spawned = {
        let _ = select;
        Command::new("xdg-open").arg(target).spawn()
    };
    if let Err(err) = spawned {
        eprintln!("wifi-heatmapper: could not open {target}: {err}");
    }
}

fn data_dir(app: &tauri::AppHandle) -> tauri::Result<PathBuf> {
    match std::env::var_os("WIFI_HEATMAPPER_DATA_DIR") {
        Some(dir) if !dir.is_empty() => Ok(PathBuf::from(dir)),
        _ => Ok(app.path().app_data_dir()?.join("data")),
    }
}

fn open_log(app: &tauri::AppHandle) -> Option<(PathBuf, File)> {
    let dir = app.path().app_log_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    let path = dir.join("server.log");
    let file = File::create(&path).ok()?;
    Some((path, file))
}

fn main() {
    tauri::Builder::default()
        .manage(Server {
            child: Mutex::new(None),
            status: Mutex::new(ServerStatus::Starting),
            tail: Arc::new(StderrTail::default()),
            quitting: AtomicBool::new(false),
            log_path: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![server_status, relaunch, reveal_log])
        .setup(|app| {
            let handle = app.handle().clone();
            let server = app.state::<Server>();
            let server_dir = app.path().resource_dir()?.join("server");
            let data_dir = data_dir(&handle)?;
            let log = open_log(&handle);
            *server.log_path.lock().unwrap() = log.as_ref().map(|(p, _)| p.clone());

            let started = free_port().and_then(|port| {
                spawn_server(&server_dir, &data_dir, port, log.as_ref().map(|(_, f)| f), server.tail.clone())
                    .map(|child| (port, child))
            });
            match started {
                Ok((port, child)) => {
                    eprintln!(
                        "wifi-heatmapper: server on http://127.0.0.1:{port}, data in {}",
                        data_dir.display()
                    );
                    server.child.lock().unwrap().replace(child);
                    let handle = handle.clone();
                    std::thread::spawn(move || watch(handle, port));
                }
                Err(err) => {
                    eprintln!("wifi-heatmapper: could not start the server: {err}");
                    server.set(ServerStatus::SpawnFailed {
                        error: format!("{err} ({})", server_dir.display()),
                        log: server.log(),
                    });
                }
            }

            WebviewWindowBuilder::new(&handle, "main", WebviewUrl::App("index.html".into()))
                .title(WINDOW_TITLE)
                .inner_size(1280.0, 860.0)
                .min_inner_size(720.0, 520.0)
                .center()
                // Links out of the app (GitHub, docs) open in the browser.
                .on_navigation(|url| {
                    let external = matches!(url.scheme(), "http" | "https" | "mailto")
                        && !matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "tauri.localhost"));
                    if external {
                        open_in_browser(url.as_str());
                    }
                    !external
                })
                .on_new_window(|url, _features| {
                    open_in_browser(url.as_str());
                    NewWindowResponse::Deny
                })
                // CSV and image exports: without a handler WKWebView drops them.
                // wry picks ~/Downloads/<name> (deduplicated); show the file when done.
                .on_download(|_webview, event| {
                    if let DownloadEvent::Finished { path: Some(path), success: true, .. } = event {
                        reveal(&path);
                    }
                    true
                })
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while starting WiFi Heatmapper")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                let server = app.state::<Server>();
                server.quitting.store(true, Ordering::SeqCst);
                let child = server.child.lock().unwrap().take();
                if let Some(child) = child {
                    stop(child);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_serializes_to_the_shape_the_launcher_reads() {
        let json = |s: &ServerStatus| serde_json::to_value(s).unwrap();
        assert_eq!(json(&ServerStatus::Starting), serde_json::json!({ "state": "starting" }));
        assert_eq!(
            json(&ServerStatus::Ready { url: "http://127.0.0.1:1/".into() }),
            serde_json::json!({ "state": "ready", "url": "http://127.0.0.1:1/" })
        );
        assert_eq!(
            json(&ServerStatus::Exited { code: Some(1), stderr: "boom".into(), log: "/l".into() }),
            serde_json::json!({ "state": "exited", "code": 1, "stderr": "boom", "log": "/l" })
        );
    }

    #[test]
    fn the_tail_keeps_the_last_lines() {
        let tail = StderrTail::default();
        for i in 0..(STDERR_TAIL_LINES + 5) {
            tail.push(format!("line {i}\n").as_bytes());
        }
        let text = tail.text();
        assert!(text.starts_with("line 5\n"));
        assert!(text.ends_with(&format!("line {}", STDERR_TAIL_LINES + 4)));
    }

    #[test]
    fn extra_path_dirs_are_added() {
        let joined = path_with_extras();
        let dirs: Vec<PathBuf> = std::env::split_paths(&joined).collect();
        for extra in EXTRA_PATH {
            assert!(dirs.contains(&PathBuf::from(extra)));
        }
    }

    #[test]
    fn a_free_port_is_not_answering() {
        let port = free_port().unwrap();
        assert!(!answers(port));
    }
}
