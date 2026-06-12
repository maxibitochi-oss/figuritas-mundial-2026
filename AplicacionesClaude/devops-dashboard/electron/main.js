const { app, BrowserWindow, session, ipcMain, Tray, Menu, nativeImage, shell } = require("electron");
const path = require("path");
const http = require("http");
const https = require("https");
const url = require("url");

const ORG_URL = "https://atioint.visualstudio.com";
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const PROXY_PORT = 17432;

let mainWindow = null;
let tray = null;
let proxyServer = null;

// ── Proxy HTTP server (resuelve CORS sin extensiones ni flags) ──────────────
function startProxy() {
  proxyServer = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const targetPath = parsed.path;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const options = {
      hostname: "atioint.visualstudio.com",
      port: 443,
      path: targetPath,
      method: req.method,
      headers: {
        ...req.headers,
        host: "atioint.visualstudio.com",
      },
    };
    delete options.headers["origin"];
    delete options.headers["referer"];

    const proxyReq = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on("error", (e) => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: e.message }));
    });

    req.pipe(proxyReq, { end: true });
  });

  proxyServer.listen(PROXY_PORT, "127.0.0.1", () => {
    console.log(`Proxy corriendo en http://127.0.0.1:${PROXY_PORT}`);
  });
}

// ── Ventana principal ────────────────────────────────────────────────────────
function createWindow() {
  const iconFile = process.platform === "win32" ? "icon.ico" : "icon.png";
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "DevOps Dashboard — ATIO International",
    icon: path.join(__dirname, iconFile),
    backgroundColor: "#0F172A",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.on("close", (e) => {
    if (process.platform === "darwin") {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── Tray icon ────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, "icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    { label: "Abrir DevOps Dashboard", click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: "separator" },
    { label: "Salir", click: () => { app.quit(); } },
  ]);

  tray.setToolTip("DevOps Dashboard — atioint");
  tray.setContextMenu(menu);
  tray.on("double-click", () => { mainWindow.show(); mainWindow.focus(); });
}

// ── IPC: PAT guardado con keychain del SO ───────────────────────────────────
ipcMain.handle("get-proxy-port", () => PROXY_PORT);

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startProxy();
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (proxyServer) proxyServer.close();
});
