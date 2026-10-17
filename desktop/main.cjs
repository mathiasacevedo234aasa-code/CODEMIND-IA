const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { buscarActualizaciones } = require('./actualizaciones.cjs');

/**
 * Proceso principal de la aplicacion de escritorio.
 *
 * El backend de CodeMind AI ya es Node, y el proceso principal de Electron
 * tambien: se carga aqui dentro en lugar de lanzar un segundo proceso. Escucha
 * en 127.0.0.1 con un puerto libre elegido por el sistema, y la ventana carga
 * esa direccion. Asi el frontend usa las mismas rutas relativas /api que en el
 * navegador y no hay dos versiones del codigo que mantener.
 */

const isDev = !app.isPackaged;

/**
 * Modo portable de verdad.
 *
 * El .exe portable de electron-builder avisa de dónde está con
 * PORTABLE_EXECUTABLE_DIR. Si existe, TODO se guarda junto a él, en
 * "CodeMind-datos": proyectos, documentación, ajustes, claves y también lo
 * que guarda el propio navegador interno. Así se lleva en una USB y en el
 * equipo de destino no queda nada en %APPDATA%.
 *
 * Tiene que hacerse antes de que la aplicación esté lista: después, Chromium
 * ya habría creado su carpeta en el sitio de siempre.
 */
const carpetaPortable = process.env.PORTABLE_EXECUTABLE_DIR
  ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'CodeMind-datos')
  : null;
if (carpetaPortable) {
  fs.mkdirSync(carpetaPortable, { recursive: true });
  app.setPath('userData', carpetaPortable);
}

// Sin esto, dos instancias competirian por la misma carpeta de datos.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let backend = null;
let mainWindow = null;
let dataDir = null;

/** Rutas del codigo del backend y del frontend compilado, segun el empaquetado. */
function resolvePaths() {
  if (isDev) {
    const root = path.resolve(__dirname, '..');
    return {
      serverEntry: path.join(root, 'server', 'src', 'app.js'),
      webDist: path.join(root, 'web', 'dist'),
    };
  }
  // En el paquete, server/ y web/dist van fuera del asar para que Node pueda
  // importarlos y para que git y los procesos hijos trabajen con rutas reales.
  const base = path.join(process.resourcesPath, 'app');
  return {
    serverEntry: path.join(base, 'server', 'src', 'app.js'),
    webDist: path.join(base, 'web', 'dist'),
  };
}

async function startBackend() {
  const { serverEntry, webDist } = resolvePaths();

  // En el paquete instalado los datos van a la carpeta del usuario, porque el
  // directorio de instalacion es de solo lectura. En desarrollo se deja el
  // server/data del repositorio para compartir proyectos con `npm run dev`.
  if (app.isPackaged) {
    process.env.CODEMIND_DATA_DIR = path.join(app.getPath('userData'), 'data');
  }
  process.env.CODEMIND_WEB_DIST = webDist;
  // Se recuerda para que el menu abra la carpeta que se esta usando de verdad,
  // que en desarrollo es la del repositorio y no la del usuario.
  dataDir = process.env.CODEMIND_DATA_DIR ?? path.join(path.dirname(path.dirname(serverEntry)), 'data');

  if (!fs.existsSync(serverEntry)) {
    throw new Error(`No se encontro el backend en ${serverEntry}`);
  }

  // El backend es ESM y este archivo es CommonJS: import dinamico.
  const { startServer } = await import(pathToFileURL(serverEntry).href);
  return startServer({ port: 0, host: '127.0.0.1' });
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f1115',
    title: 'CodeMind AI',
    autoHideMenuBar: true,
    webPreferences: {
      // La ventana solo habla con el backend por HTTP: no necesita acceso a
      // Node, asi que no se le da.
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  void mainWindow.loadURL(url);

  // "Abrir en el navegador del sistema" debe salir de la aplicacion, no abrir
  // una ventana de Electron sin barra de direcciones.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
    return { action: 'deny' };
  });

  // Una navegacion fuera de nuestro origen tampoco debe ocurrir en la ventana
  // principal: el navegador integrado vive en un iframe, no aqui.
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu(url) {
  // Menu minimo: lo imprescindible para trabajar y depurar, sin ruido.
  const template = [
    {
      label: 'Archivo',
      submenu: [{ role: 'quit', label: 'Salir' }],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamano normal' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Carpeta de datos',
          click: () => void shell.openPath(dataDir ?? app.getPath('userData')),
        },
        {
          label: 'Abrir en el navegador',
          click: () => void shell.openExternal(url),
        },
        { type: 'separator' },
        {
          label: 'Buscar actualizaciones...',
          click: () => void buscarActualizaciones(mainWindow),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    backend = await startBackend();
    console.log(`[codemind] backend en ${backend.url}`);
    buildMenu(backend.url);
    createWindow(backend.url);
    // Una comprobacion discreta al arrancar: solo dice algo si hay version
    // nueva, y aun entonces pregunta antes de descargar nada.
    setTimeout(() => void buscarActualizaciones(mainWindow, { silencioso: true }), 15000);
  } catch (err) {
    dialog.showErrorBox(
      'CodeMind AI no pudo arrancar',
      `${err.message}\n\nSi el problema persiste, revisa la carpeta de datos en:\n${app.getPath('userData')}`,
    );
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && backend) createWindow(backend.url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Los servidores de desarrollo que el usuario haya arrancado no pueden quedar
// huerfanos ocupando puertos despues de cerrar la aplicacion.
let cleaning = false;
app.on('before-quit', (event) => {
  if (!backend || cleaning) return;
  cleaning = true;
  event.preventDefault();

  // Si el cierre ordenado se atascara, la aplicacion debe terminar de todas
  // formas: un proceso que no muere impide volver a abrirla, porque el bloqueo
  // de instancia unica sigue tomado.
  const forzar = setTimeout(() => app.exit(0), 5000);

  backend
    .close()
    .catch((err) => console.error('[codemind] error al cerrar el backend:', err.message))
    .finally(() => {
      clearTimeout(forzar);
      app.exit(0);
    });
});
