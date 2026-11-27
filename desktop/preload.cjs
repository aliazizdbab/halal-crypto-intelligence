const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hciDesktop", {
  isElectron: true,
  platform: process.platform,
  checkForUpdates: () => ipcRenderer.invoke("hci:check-updates"),
  installUpdate: () => ipcRenderer.invoke("hci:install-update"),
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("hci:update-status", listener);
    return () => ipcRenderer.removeListener("hci:update-status", listener);
  },
});
