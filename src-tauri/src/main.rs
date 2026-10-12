#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine};
use std::{path::Path, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

#[derive(Default)]
struct Folder(Mutex<Option<String>>);

// Chrome jaisa user agent: Google login embedded webview mein aksar block hota hai, ye help karta hai.
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";

#[tauri::command]
fn set_folder(path: String, st: State<Folder>) -> Result<(), String> {
    if !Path::new(&path).is_dir() {
        return Err("Folder nahi mila".into());
    }
    *st.0.lock().map_err(|e| e.to_string())? = Some(path);
    Ok(())
}

// Sirf chune hue folder mein "<number>.jpg" likhta hai (koi aur path ya naam allowed nahi).
#[tauri::command]
fn save_image(n: u32, b64: String, st: State<Folder>) -> Result<String, String> {
    if n == 0 || n > 100_000 {
        return Err("galat number".into());
    }
    let folder = st.0.lock().map_err(|e| e.to_string())?.clone().ok_or("Pehle save folder chuno")?;
    let bytes = STANDARD.decode(b64.trim()).map_err(|e| e.to_string())?;
    let path = Path::new(&folder).join(format!("{n}.jpg"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn flow_report(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    app.emit("flow-report", payload).map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_flow(app: AppHandle, url: String, visible: bool) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("flow") {
        if visible {
            w.show().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let parsed: tauri::Url = url.parse().map_err(|_| "URL galat hai".to_string())?;
    WebviewWindowBuilder::new(&app, "flow", WebviewUrl::External(parsed))
        .title("Google Flow")
        .inner_size(1100.0, 800.0)
        .user_agent(UA)
        .initialization_script(include_str!("flow_driver.js"))
        .visible(visible)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn flow_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let w = app.get_webview_window("flow").ok_or("Flow window khuli nahi hai")?;
    if visible { w.show() } else { w.hide() }.map_err(|e| e.to_string())
}

#[tauri::command]
fn flow_eval(app: AppHandle, js: String) -> Result<(), String> {
    let w = app.get_webview_window("flow").ok_or("Pehle 'Open Flow' dabao")?;
    w.eval(&js).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Folder::default())
        .invoke_handler(tauri::generate_handler![set_folder, save_image, flow_report, open_flow, flow_visible, flow_eval])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("FlowBulk Pro chalne mein error");
}
