import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = path.resolve(desktopDirectory, "../..");
const installerDirectory = path.join(desktopDirectory, "installer");
const coreTauriConfig = JSON.parse(
  readFileSync(path.join(desktopDirectory, "src-tauri", "tauri.conf.json"), "utf8"),
);
const customTauriConfig = JSON.parse(
  readFileSync(path.join(installerDirectory, "src-tauri", "tauri.conf.json"), "utf8"),
);
const tauriCli = path.join(desktopDirectory, "node_modules", "@tauri-apps", "cli", "tauri.js");
const coreExecutable = path.join(
  desktopDirectory,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "nsis",
  `${coreTauriConfig.productName}_${coreTauriConfig.version}_x64-setup.exe`,
);
const installerResources = path.join(installerDirectory, "src-tauri", "resources");
const installerIcons = path.join(installerDirectory, "src-tauri", "icons");
const installerAssets = path.join(installerDirectory, "ui", "assets");
const finalInstaller = path.join(
  desktopDirectory,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "nsis",
  `${customTauriConfig.productName}_instalador-personalizado.exe`,
);
const customInstallerExecutable = path.join(
  desktopDirectory,
  "src-tauri",
  "target",
  "release",
  "alquilaya-erp-installer.exe",
);
function runTauri(args, cwd, env = process.env) {
  const result = spawnSync(process.execPath, [tauriCli, ...args], {
    cwd,
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error(`No se pudo ejecutar Tauri: ${result.error.message}`, { cause: result.error });
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("1/3 · Compilando la aplicación y su instalador de Windows...");
runTauri(["build", "--bundles", "nsis"], desktopDirectory);
statSync(coreExecutable);

console.log("2/3 · Preparando la interfaz personalizada del instalador...");
mkdirSync(installerResources, { recursive: true });
mkdirSync(installerIcons, { recursive: true });
mkdirSync(installerAssets, { recursive: true });
copyFileSync(
  coreExecutable,
  path.join(installerResources, "alquilaya-erp-core-setup.exe"),
);
for (const iconName of ["icon.ico", "32x32.png", "128x128.png", "128x128@2x.png"]) {
  copyFileSync(
    path.join(desktopDirectory, "src-tauri", "icons", iconName),
    path.join(installerIcons, iconName),
  );
}
copyFileSync(
  path.join(repositoryDirectory, "apps", "web", "public", "app-icon.png"),
  path.join(installerAssets, "app-icon.png"),
);
copyFileSync(
  path.join(repositoryDirectory, "apps", "web", "public", "logo-white-mode.png"),
  path.join(installerAssets, "brand-logo.png"),
);

console.log("3/3 · Creando el instalador personalizado de AlquilaYa ERP...");
runTauri(["build", "--no-bundle"], installerDirectory, {
  ...process.env,
  CARGO_TARGET_DIR: path.join(desktopDirectory, "src-tauri", "target"),
});
statSync(customInstallerExecutable);
copyFileSync(customInstallerExecutable, finalInstaller);

const sizeMegabytes = (statSync(finalInstaller).size / 1024 / 1024).toFixed(2);
console.log(`Instalador personalizado listo (${sizeMegabytes} MB):`);
console.log(finalInstaller);
