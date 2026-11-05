use std::{
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::WebviewWindow;

const EMBEDDED_INSTALLER: &[u8] = include_bytes!("../resources/alquilaya-erp-core-setup.exe");

#[tauri::command]
fn get_install_location() -> Result<String, String> {
    std::env::var("LOCALAPPDATA")
        .map(|path| format!("{path}\\AlquilaYa ERP"))
        .map_err(|error| format!("No se encontró la carpeta de instalación del usuario: {error}"))
}

#[tauri::command]
async fn install() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("No se pudo crear el archivo temporal: {error}"))?
            .as_millis();
        let installer_path = std::env::temp_dir().join(format!(
            "alquilaya-erp-setup-{}-{timestamp}.exe",
            std::process::id()
        ));

        fs::write(&installer_path, EMBEDDED_INSTALLER)
            .map_err(|error| format!("No se pudo preparar el instalador: {error}"))?;

        let run_result = (|| {
            let mut command = Command::new(&installer_path);
            command.arg("/S");

            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }

            let status = command
                .status()
                .map_err(|error| format!("No se pudo iniciar el instalador: {error}"))?;

            if status.success() {
                Ok(())
            } else {
                Err(format!(
                    "El instalador finalizó con el código {}.",
                    status.code().unwrap_or(-1)
                ))
            }
        })();

        let cleanup_result = fs::remove_file(&installer_path);

        if let Err(error) = run_result {
            return Err(error);
        }

        cleanup_result.map_err(|error| format!("No se pudo limpiar el instalador temporal: {error}"))?;

        Ok(())
    })
    .await
    .map_err(|error| format!("Falló la tarea de instalación: {error}"))?
}

#[tauri::command]
fn open_installed_app() -> Result<(), String> {
    let local_app_data = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "No se encontró la carpeta de aplicaciones del usuario.".to_string())?;
    let executable = local_app_data
        .join("AlquilaYa ERP")
        .join("contract-desktop.exe");

    if !executable.is_file() {
        return Err("No se encontró AlquilaYa ERP en la carpeta de instalación.".to_string());
    }

    Command::new(&executable)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("No se pudo abrir AlquilaYa ERP: {error}"))
}

#[tauri::command]
fn minimize_window(window: WebviewWindow) -> Result<(), String> {
    window
        .minimize()
        .map_err(|error| format!("No se pudo minimizar la ventana: {error}"))
}

#[tauri::command]
fn close_window(window: WebviewWindow) -> Result<(), String> {
    window
        .close()
        .map_err(|error| format!("No se pudo cerrar el instalador: {error}"))
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_install_location,
            install,
            open_installed_app,
            minimize_window,
            close_window
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar el instalador de AlquilaYa ERP");
}
