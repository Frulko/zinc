// The bench app (ZN-713), Tauri version: one window on src/index.html, which calls first_frame once its first frame was presented.
#[tauri::command]
fn first_frame() {
    println!("first-frame");
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![first_frame])
        .run(tauri::generate_context!())
        .expect("the app failed to start");
}
