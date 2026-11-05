const { invoke } = window.__TAURI__.core;

const setupContent = document.getElementById("setup-content");
const progressView = document.getElementById("progress-view");
const stepNumber = document.getElementById("step-number");
const stepLabel = document.getElementById("step-label");
const installButton = document.getElementById("install-button");
const launchButton = document.getElementById("launch-button");
const retryButton = document.getElementById("retry-button");
const progressTitle = document.getElementById("progress-title");
const progressEyebrow = document.getElementById("progress-eyebrow");
const progressDescription = document.getElementById("progress-description");
const progressStatus = document.getElementById("progress-status");
const progressBar = document.getElementById("progress-bar");
const progressIcon = document.getElementById("progress-icon");
const successCheck = document.getElementById("success-check");
const actionHint = document.querySelector(".action-hint");
const installLocation = document.getElementById("install-location");

invoke("get_install_location")
  .then((path) => {
    installLocation.textContent = path;
    installLocation.title = path;
  })
  .catch((error) => {
    showError(String(error));
  });

let isInstalling = false;
let isInstalled = false;

document.getElementById("minimize-button").addEventListener("click", () => {
  invoke("minimize_window");
});

document.getElementById("close-button").addEventListener("click", () => {
  invoke("close_window");
});

function showProgress() {
  setupContent.classList.add("hidden");
  progressView.classList.remove("hidden");
  stepNumber.textContent = "02";
  stepLabel.textContent = "PROCESO DE INSTALACIÓN";
}

function showError(message) {
  isInstalling = false;
  showProgress();
  progressView.classList.add("has-error");
  progressEyebrow.textContent = "NO SE PUDO COMPLETAR LA INSTALACIÓN";
  progressTitle.textContent = "Ocurrió un problema";
  progressDescription.textContent =
    "La aplicación no se instaló. Puedes volver a intentarlo; si el problema continúa, consulta con el administrador.";
  progressStatus.textContent = message;
  progressBar.classList.remove("done");
  progressBar.style.animation = "none";
  progressIcon.classList.remove("complete");
  successCheck.classList.add("hidden");
  installButton.classList.add("hidden");
  launchButton.classList.add("hidden");
  retryButton.classList.remove("hidden");
}

function showInstalled(message = "Instalación completada. AlquilaYa ERP está listo.") {
  isInstalling = false;
  isInstalled = true;
  stepNumber.textContent = "03";
  stepLabel.textContent = "INSTALACIÓN COMPLETADA";
  progressEyebrow.textContent = "BIENVENIDO A ALQUILAYA ERP";
  progressTitle.textContent = "Todo listo para empezar";
  progressDescription.textContent =
    "La aplicación ya está instalada. Abre tu espacio de trabajo cuando quieras.";
  progressStatus.textContent = message;
  progressBar.classList.add("done");
  progressIcon.classList.add("complete");
  successCheck.classList.remove("hidden");
  launchButton.classList.remove("hidden");
  retryButton.classList.add("hidden");
  installButton.classList.add("hidden");
  actionHint.classList.add("hidden");
}

async function startInstallation() {
  if (isInstalling || isInstalled) return;
  isInstalling = true;
  showProgress();
  progressView.classList.remove("has-error");
  progressBar.classList.remove("done");
  progressBar.style.removeProperty("animation");
  launchButton.classList.add("hidden");
  retryButton.classList.add("hidden");
  installButton.classList.add("hidden");
  progressIcon.classList.remove("complete");
  successCheck.classList.add("hidden");
  progressEyebrow.textContent = "PREPARANDO TU ESPACIO DE TRABAJO";
  progressTitle.textContent = "Instalando AlquilaYa ERP";
  progressDescription.textContent =
    "Estamos configurando la aplicación. Puedes dejar esta ventana abierta mientras termina.";
  progressStatus.textContent = "Preparando la instalación...";

  try {
    await invoke("install");
    showInstalled();
  } catch (error) {
    showError(String(error));
  }
}

installButton.addEventListener("click", startInstallation);
retryButton.addEventListener("click", startInstallation);

launchButton.addEventListener("click", async () => {
  launchButton.disabled = true;
  progressStatus.textContent = "Abriendo AlquilaYa ERP...";
  try {
    await invoke("open_installed_app");
    await invoke("close_window");
  } catch (error) {
    launchButton.disabled = false;
    progressStatus.textContent = String(error);
  }
});
