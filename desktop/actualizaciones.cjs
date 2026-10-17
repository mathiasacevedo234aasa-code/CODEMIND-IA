const { app, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Actualizaciones de la aplicacion instalada.
 *
 * Mira si hay una version nueva publicada en las Releases de GitHub del
 * proyecto (lo que diga `publish` en electron-builder.yml). Nunca descarga ni
 * instala por su cuenta: avisa, y solo si el usuario dice que si descarga; y
 * al terminar vuelve a preguntar antes de reiniciar. Lo mismo que con el
 * codigo: la aplicacion propone, el usuario decide.
 *
 * Si la instalacion no tiene a donde preguntar (sin `publish` configurado no
 * existe app-update.yml) o se ejecuta en desarrollo, lo dice tal cual en vez
 * de fingir que lo comprueba.
 */

let actualizador = null;
let comprobando = false;

function cargar() {
  if (actualizador) return actualizador;
  if (!app.isPackaged) return null;
  if (!fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) return null;
  // En el paquete, electron-updater viaja junto a las dependencias del
  // backend, fuera del asar (ver scripts/pack-runtime.mjs).
  const modulo = path.join(process.resourcesPath, 'app', 'node_modules', 'electron-updater');
  ({ autoUpdater: actualizador } = require(fs.existsSync(modulo) ? modulo : 'electron-updater'));
  actualizador.autoDownload = false;
  actualizador.autoInstallOnAppQuit = false;
  return actualizador;
}

/**
 * @param {Electron.BrowserWindow | null} ventana
 * @param {{ silencioso?: boolean }} opciones  silencioso: al arrancar solo se
 *   habla si hay algo nuevo; desde el menu se informa siempre del resultado.
 */
async function buscarActualizaciones(ventana, { silencioso = false } = {}) {
  const avisar = (opts) => (ventana ? dialog.showMessageBox(ventana, opts) : dialog.showMessageBox(opts));

  // El .exe portable no se puede sustituir a sí mismo: se dice cómo actualizarlo.
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    if (!silencioso) {
      await avisar({
        type: 'info',
        title: 'Actualizaciones',
        message: 'La versión portable no se actualiza sola.',
        detail: `Descarga el nuevo CodeMind-AI-Portable desde las Releases del proyecto y sustituye el .exe. Tus datos están en la carpeta CodeMind-datos, junto al ejecutable, y se conservan.\n\nVersión actual: ${app.getVersion()}`,
      });
    }
    return;
  }

  const au = cargar();
  if (!au) {
    if (!silencioso) {
      await avisar({
        type: 'info',
        title: 'Actualizaciones',
        message: app.isPackaged
          ? 'Esta instalacion no tiene configurado donde buscar actualizaciones.'
          : 'Las actualizaciones solo se comprueban en la aplicacion instalada.',
        detail: `Version actual: ${app.getVersion()}`,
      });
    }
    return;
  }
  if (comprobando) return;
  comprobando = true;

  try {
    const res = await au.checkForUpdates();
    const nueva = res?.updateInfo?.version;
    if (!nueva || nueva === app.getVersion() || !res.isUpdateAvailable) {
      if (!silencioso) {
        await avisar({ type: 'info', title: 'Actualizaciones', message: `Tienes la ultima version (${app.getVersion()}).` });
      }
      return;
    }

    const { response } = await avisar({
      type: 'question',
      title: 'Hay una version nueva',
      message: `CodeMind AI ${nueva} esta disponible (tienes la ${app.getVersion()}).`,
      detail: 'Se descarga en segundo plano y te preguntara antes de reiniciar. Tus proyectos y tu documentacion no se tocan.',
      buttons: ['Descargar', 'Ahora no'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return;

    await au.downloadUpdate();
    const fin = await avisar({
      type: 'question',
      title: 'Actualizacion lista',
      message: `CodeMind AI ${nueva} esta descargada.`,
      detail: 'Para instalarla hay que cerrar y volver a abrir la aplicacion. Guarda lo que tengas a medias antes.',
      buttons: ['Reiniciar e instalar', 'Mas tarde'],
      defaultId: 0,
      cancelId: 1,
    });
    // "Mas tarde": queda descargada y se instala al cerrar la aplicacion.
    if (fin.response === 0) au.quitAndInstall();
    else au.autoInstallOnAppQuit = true;
  } catch (err) {
    // Sin conexion, sin versiones publicadas, repositorio privado...: se
    // cuenta solo si lo pidio el usuario; al arrancar no merece un dialogo.
    if (!silencioso) {
      await avisar({
        type: 'warning',
        title: 'Actualizaciones',
        message: 'No se pudo comprobar si hay una version nueva.',
        detail: String(err?.message ?? err).split('\n')[0].slice(0, 300),
      });
    }
  } finally {
    comprobando = false;
  }
}

module.exports = { buscarActualizaciones };
