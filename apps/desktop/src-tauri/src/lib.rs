use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("no se encontró la ventana principal de AlquilaYa ERP");
            let icon = tauri::include_image!("icons/icon.png");
            window
                .set_icon(icon)
                .expect("no se pudo aplicar el icono de AlquilaYa ERP");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación");
}
