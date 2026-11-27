const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("node:path");
const net = require("node:net");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let serverProcess = null;
let serverPort = 3000;

function findFreePort(preferred = 3145) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", () => {
      const fallback = net.createServer();
      fallback.listen(0, "127.0.0.1", () => {
        const addr = fallback.address();
        fallback.close(() => resolve(addr.port));
      });
    });
    srv.listen(preferred, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => resolve(addr.port));
    });
  });
}

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // server still booting
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function getStandaloneServerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "standalone", "server.js");
  }
  return path.join(__dirname, "..", ".next", "standalone", "server.js");
}

async function startEmbeddedNextServer() {
  const serverJs = getStandaloneServerPath();
  if (!fs.existsSync(serverJs)) {
    throw new Error(`Bundled Next.js standalone server not found at ${serverJs}`);
  }

  serverPort = await findFreePort(3145);
  const userDataDir = app.getPath("userData");
  fs.mkdirSync(userDataDir, { recursive: true });
  const dbPath = path.join(userDataDir, "halal-crypto.sqlite");

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(serverPort),
    DATABASE_PATH: dbPath,
    HCI_RUNTIME: "electron",
    NEXT_TELEMETRY_DISABLED: "1",
  };

  serverProcess = spawn(process.execPath, [serverJs], {
    cwd: path.dirname(serverJs),
    env,
    stdio: "pipe",
    windowsHide: true,
  });

  serverProcess.stderr?.on("data", (chunk) => {
    console.error("[NextServer]", chunk.toString());
  });

  const ready = await waitForServer(`http://127.0.0.1:${serverPort}/api/version`, 25000);
  if (!ready) {
    throw new Error("Timed out waiting for embedded Halal Crypto Intelligence server to start.");
  }
}

function stopEmbeddedServer() {
  if (serverProcess && !serverProcess.killed) {
    try {
      serverProcess.kill();
    } catch {
      // ignore
    }
    serverProcess = null;
  }
}

function emitUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("hci:update-status", payload);
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => emitUpdateStatus({ status: "checking" }));
  autoUpdater.on("update-available", (info) =>
    emitUpdateStatus({ status: "available", version: info.version })
  );
  autoUpdater.on("update-not-available", () => emitUpdateStatus({ status: "not-available" }));
  autoUpdater.on("download-progress", (p) =>
    emitUpdateStatus({ status: "downloading", percent: p.percent })
  );
  autoUpdater.on("update-downloaded", (info) =>
    emitUpdateStatus({ status: "downloaded", version: info.version })
  );
  autoUpdater.on("error", (err) =>
    emitUpdateStatus({ status: "error", message: err?.message || "Update error" })
  );

  // Check shortly after startup, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => null), 8000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => null), 4 * 60 * 60 * 1000);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#060a13",
    title: "Halal Crypto Intelligence",
    icon: path.join(__dirname, "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links (Binance, Shariah sources, GitHub) in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    shell.openExternal(url).catch(() => null);
    return { action: "deny" };
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
}

ipcMain.handle("hci:check-updates", async () => {
  if (!app.isPackaged) return;
  await autoUpdater.checkForUpdates().catch(() => null);
});

ipcMain.handle("hci:install-update", async () => {
  if (!app.isPackaged) return;
  stopEmbeddedServer();
  autoUpdater.quitAndInstall(false, true);
});

app.whenReady().then(async () => {
  try {
    await startEmbeddedNextServer();
    createMainWindow();
    setupAutoUpdater();
  } catch (err) {
    dialog.showErrorBox(
      "Halal Crypto Intelligence — Startup Error",
      err instanceof Error ? err.message : String(err)
    );
    app.quit();
  }
});

app.on("before-quit", () => {
  stopEmbeddedServer();
});

app.on("window-all-closed", () => {
  stopEmbeddedServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
