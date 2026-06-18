const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cassa", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (cfg) => ipcRenderer.invoke("config:set", cfg),
  printReceipt: (input) => ipcRenderer.invoke("printer:receipt", input),
  dailyClose: () => ipcRenderer.invoke("printer:dailyClose"),
  getFlags: () => ipcRenderer.invoke("cfg:flags"),
  buildConfig: (kind, payload) => ipcRenderer.invoke("cfg:build", { kind, payload }),
  sendConfig: (xml) => ipcRenderer.invoke("cfg:send", xml),
});
