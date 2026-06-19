const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const fpmate = require("./src/fpmate-client");
const cfgClient = require("./src/config-client");

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return { ip: "192.168.1.251", https: false, timeoutMs: 10000, operator: "1", devid: "local_printer" };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 820,
    minHeight: 600,
    title: "Cassa RT Epson",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- IPC: la comunicazione con la stampante avviene QUI (niente CORS) ----

ipcMain.handle("config:get", () => loadConfig());

ipcMain.handle("config:set", (_e, cfg) => {
  saveConfig(cfg);
  return loadConfig();
});

ipcMain.handle("printer:receipt", async (_e, input) => {
  const cfg = loadConfig();
  return fpmate.printReceipt(cfg, { operator: cfg.operator, ...input });
});

ipcMain.handle("printer:dailyClose", async () => {
  const cfg = loadConfig();
  return fpmate.dailyClose(cfg, cfg.operator);
});

// ---- Configurazione stampante ----

// Genera l'XML (senza inviarlo): serve a popolare il riquadro modificabile.
ipcMain.handle("cfg:flags", () => cfgClient.FLAGS);

ipcMain.handle("cfg:build", (_e, { kind, payload }) => {
  switch (kind) {
    case "header":        return cfgClient.buildHeaderXml(payload.lines, payload.commit !== false);
    case "header:read":   return cfgClient.buildReadHeaderXml(payload.number);
    case "department":    return cfgClient.buildDepartmentXml(payload);
    case "department:read": return cfgClient.buildReadDepartmentXml(payload.number);
    case "vat":           return cfgClient.buildVatXml(payload);
    case "vat:read":      return cfgClient.buildReadVatXml(payload.group);
    case "card":          return cfgClient.buildCreditCardXml(payload.index, payload.description);
    case "ticket":        return cfgClient.buildTicketXml(payload.index, payload.description, payload.value);
    case "cash":          return cfgClient.buildCashXml(payload.index, payload.description);
    case "payments:read": return cfgClient.buildReadPaymentsXml(payload.subkind, payload.index);
    case "operator":      return cfgClient.buildOperatorXml(payload);
    case "operator:read": return cfgClient.buildReadOperatorXml(payload.number);
    case "datetime":      return cfgClient.buildDateTimeXml(payload);
    case "datetime:read": return cfgClient.buildReadDateTimeXml();
    case "flag":          return cfgClient.buildFlagXml(payload.number, payload.value);
    case "flag:read":     return cfgClient.buildReadFlagXml(payload.number);
    default: throw new Error("kind sconosciuto: " + kind);
  }
});

// Invia un XML grezzo (quello mostrato/eventualmente modificato nel riquadro).
ipcMain.handle("cfg:send", async (_e, xml) => {
  const cfg = loadConfig();
  const res = await fpmate.sendToPrinter(cfg, xml);
  // Se è una lettura, decodifica responseData in una stringa leggibile.
  if (res.responseData) {
    const cmd = res.responseCommand || (xml.match(/command="(\d+)"/) || [])[1];
    res.decoded = cfgClient.decodeResponse(cmd, res.responseData);
  }
  return res;
});
