import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './store.js';

/**
 * Servidor de vista previa, como Live Server.
 *
 * Hasta ahora la vista previa era un iframe con el HTML metido dentro. Eso
 * sirve para mirar una pagina suelta y se queda corto en cuanto el proyecto es
 * un proyecto: las rutas relativas no resuelven igual, `fetch` no funciona,
 * los modulos de JavaScript no cargan porque necesitan un origen de verdad, y
 * nada de lo que dependa del protocolo http se comporta como se comportara en
 * produccion.
 *
 * Esto levanta un servidor HTTP de verdad sobre la carpeta del proyecto, uno
 * por proyecto, en 127.0.0.1 y en un puerto suyo. Ademas vigila los archivos y
 * recarga la pagina sola al guardar, que es lo que uno espera de una vista
 * previa mientras escribe.
 *
 * Solo escucha en 127.0.0.1: sirve archivos del disco del usuario y no debe
 * quedar accesible desde la red.
 */

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml; charset=utf-8',
};

/** Carpetas que no tiene sentido vigilar: cambian solas y son enormes. */
const IGNORADAS = /(^|[\\/])(node_modules|\.git|dist|build|\.next|\.cache|coverage|release|target|__pycache__)([\\/]|$)/;

/**
 * El trozo que se inyecta en cada pagina HTML para recargar al guardar.
 *
 * Va al final del body y es deliberadamente pequeño y silencioso: si el
 * servidor se para, deja de reintentar en vez de llenar la consola del usuario
 * de errores rojos sobre algo que no es culpa de su codigo.
 */
const RECARGA = `
<script>
(() => {
  let reintentos = 0;
  const conectar = () => {
    const fuente = new EventSource('/__codemind/eventos');
    fuente.addEventListener('cambio', () => location.reload());
    fuente.addEventListener('open', () => { reintentos = 0; });
    fuente.onerror = () => {
      fuente.close();
      // Si CodeMind AI se cierra, no tiene sentido seguir intentandolo.
      if (reintentos++ < 10) setTimeout(conectar, 1000);
    };
  };
  conectar();
})();
</script>`;

/** Servidores vivos: clave projectId. */
const registro = new Map();

const vistaPublica = (s) => ({
  projectId: s.projectId,
  raiz: s.raiz,
  puerto: s.puerto,
  url: `http://127.0.0.1:${s.puerto}`,
  estado: s.estado,
  arrancado: s.arrancado,
  entrada: s.entrada,
  peticiones: s.peticiones,
  ultimaRecarga: s.ultimaRecarga,
});

/** Impide salir de la carpeta del proyecto, venga la ruta como venga. */
function resolverDentro(raiz, pedido) {
  let decodificado;
  try {
    decodificado = decodeURIComponent(pedido.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  const limpio = decodificado.replace(/\\/g, '/').replace(/^\/+/, '');
  const absoluto = path.resolve(raiz, limpio);
  const dentro = path.resolve(raiz);
  if (absoluto !== dentro && !absoluto.startsWith(dentro + path.sep)) return null;
  return absoluto;
}

async function servirArchivo(res, archivo, { inyectar }) {
  const ext = path.extname(archivo).toLowerCase();
  const tipo = TIPOS[ext] ?? 'application/octet-stream';

  if (inyectar && (ext === '.html' || ext === '.htm')) {
    let html = await fsp.readFile(archivo, 'utf8');
    // Antes de </body> si lo hay; si no, al final. Una pagina sin </body>
    // sigue siendo una pagina y tiene que recargarse igual.
    html = /<\/body\s*>/i.test(html)
      ? html.replace(/<\/body\s*>/i, `${RECARGA}\n</body>`)
      : html + RECARGA;
    res.writeHead(200, {
      'Content-Type': tipo,
      'Cache-Control': 'no-store',
    });
    res.end(html);
    return;
  }

  const datos = await fsp.stat(archivo);
  res.writeHead(200, {
    'Content-Type': tipo,
    'Content-Length': datos.size,
    // Sin cache: lo que se mira es lo que acabas de guardar.
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(archivo).pipe(res);
}

function paginaDeError(codigo, titulo, detalle) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${codigo}</title>
<style>
  body { font-family: system-ui, sans-serif; background: #11141b; color: #d7dce5;
         display: grid; place-items: center; height: 100vh; margin: 0; }
  main { max-width: 34rem; padding: 2rem; }
  h1 { font-size: 3rem; margin: 0 0 .5rem; color: #5b8cff; }
  p { line-height: 1.6; color: #98a2b3; }
  code { background: #1b1f2a; padding: .15rem .4rem; border-radius: 4px; color: #d7dce5; }
</style></head><body><main>
  <h1>${codigo}</h1><h2>${titulo}</h2><p>${detalle}</p>
  <p style="font-size:.85rem;opacity:.6">Vista previa de CodeMind AI</p>
</main>${RECARGA}</body></html>`;
}

async function manejar(sesion, req, res) {
  sesion.peticiones++;

  // El canal por el que se avisa de los cambios.
  if (req.url.startsWith('/__codemind/eventos')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    sesion.clientes.add(res);
    req.on('close', () => sesion.clientes.delete(res));
    return;
  }

  const destino = resolverDentro(sesion.raiz, req.url);
  if (!destino) {
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(paginaDeError(403, 'Fuera de la carpeta', 'Esa ruta apunta fuera del proyecto, asi que no se sirve.'));
    return;
  }

  try {
    let archivo = destino;
    const datos = await fsp.stat(archivo).catch(() => null);

    if (datos?.isDirectory()) {
      // Una carpeta se sirve por su indice; si no lo tiene, se dice cuales hay.
      const indice = path.join(archivo, 'index.html');
      if (await fsp.access(indice).then(() => true).catch(() => false)) {
        archivo = indice;
      } else {
        const entradas = (await fsp.readdir(archivo, { withFileTypes: true }))
          .filter((e) => !e.name.startsWith('.'))
          .slice(0, 200);
        const base = req.url.split('?')[0].replace(/\/?$/, '/');
        const lista = entradas
          .map((e) => `<li><a href="${base}${encodeURIComponent(e.name)}">${e.name}${e.isDirectory() ? '/' : ''}</a></li>`)
          .join('');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(`<!doctype html><meta charset="utf-8"><title>${base}</title>
<style>body{font-family:system-ui;background:#11141b;color:#d7dce5;padding:2rem}
a{color:#5b8cff;text-decoration:none}a:hover{text-decoration:underline}li{margin:.25rem 0}</style>
<h2>${base}</h2><ul>${lista}</ul>${RECARGA}`);
        return;
      }
    } else if (!datos) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(paginaDeError(404, 'No existe', `No hay ningun archivo en <code>${req.url.split('?')[0]}</code> dentro de tu proyecto.`));
      return;
    }

    await servirArchivo(res, archivo, { inyectar: true });
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(paginaDeError(500, 'Error al servir el archivo', String(err.message)));
  }
}

/** Avisa a las paginas abiertas de que algo cambio. */
function avisar(sesion) {
  sesion.ultimaRecarga = new Date().toISOString();
  for (const cliente of sesion.clientes) {
    try {
      cliente.write('event: cambio\ndata: 1\n\n');
    } catch {
      sesion.clientes.delete(cliente);
    }
  }
}

function vigilar(sesion) {
  try {
    sesion.vigilante = fs.watch(sesion.raiz, { recursive: true }, (_tipo, nombre) => {
      if (nombre && IGNORADAS.test(String(nombre))) return;
      // Guardar un archivo dispara varios eventos seguidos; se espera un poco
      // para recargar una sola vez, y no tres.
      clearTimeout(sesion.temporizador);
      sesion.temporizador = setTimeout(() => avisar(sesion), 120);
    });
  } catch (err) {
    // En algunos sistemas de archivos de red no hay vigilancia recursiva. La
    // vista previa sigue sirviendo; solo se pierde la recarga automatica.
    sesion.avisoVigilancia = `No se pueden vigilar los cambios en esta carpeta (${err.message}). La pagina se sirve igual, pero hay que recargarla a mano.`;
  }
}

export async function arrancar(projectId, raiz, { puerto } = {}) {
  const existente = registro.get(projectId);
  if (existente?.estado === 'activo') return vistaPublica(existente);

  const sesion = {
    projectId,
    raiz: path.resolve(raiz),
    puerto: null,
    estado: 'arrancando',
    arrancado: new Date().toISOString(),
    entrada: null,
    peticiones: 0,
    clientes: new Set(),
    servidor: null,
    vigilante: null,
    temporizador: null,
    ultimaRecarga: null,
    avisoVigilancia: null,
  };

  const servidor = http.createServer((req, res) => {
    manejar(sesion, req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  sesion.servidor = servidor;

  await new Promise((resolve, reject) => {
    servidor.on('error', (err) => {
      reject(new HttpError(500, err.code === 'EADDRINUSE'
        ? `El puerto ${puerto} ya esta ocupado por otro programa. Prueba con otro o deja que se elija solo.`
        : `No se pudo arrancar la vista previa: ${err.message}`));
    });
    // Puerto 0 = el sistema elige uno libre. Es lo que evita choques con lo
    // que el usuario ya tenga corriendo.
    servidor.listen(Number(puerto) || 0, '127.0.0.1', resolve);
  });

  sesion.puerto = servidor.address().port;
  sesion.estado = 'activo';
  sesion.entrada = await buscarEntrada(sesion.raiz);
  vigilar(sesion);
  registro.set(projectId, sesion);

  return { ...vistaPublica(sesion), aviso: sesion.avisoVigilancia };
}

/** La pagina por la que tiene sentido empezar. */
async function buscarEntrada(raiz) {
  const candidatos = ['index.html', 'index.htm', 'public/index.html', 'src/index.html', 'web/index.html'];
  for (const c of candidatos) {
    if (await fsp.access(path.join(raiz, c)).then(() => true).catch(() => false)) return c;
  }
  const entradas = await fsp.readdir(raiz).catch(() => []);
  return entradas.find((e) => /\.html?$/i.test(e)) ?? null;
}

export function estado(projectId) {
  const sesion = registro.get(projectId);
  if (!sesion || sesion.estado !== 'activo') return { activo: false };
  return { activo: true, ...vistaPublica(sesion), aviso: sesion.avisoVigilancia };
}

export async function detener(projectId) {
  const sesion = registro.get(projectId);
  if (!sesion) return { ok: true };

  sesion.estado = 'detenido';
  clearTimeout(sesion.temporizador);
  try {
    sesion.vigilante?.close();
  } catch {
    /* ya estaba cerrado */
  }
  for (const cliente of sesion.clientes) {
    try {
      cliente.end();
    } catch {
      /* el navegador ya se fue */
    }
  }
  sesion.clientes.clear();
  sesion.servidor.closeAllConnections?.();
  await new Promise((resolve) => sesion.servidor.close(resolve));
  registro.delete(projectId);
  return { ok: true };
}

/** Recargar a mano, para cuando la vigilancia no esta disponible. */
export function recargar(projectId) {
  const sesion = registro.get(projectId);
  if (!sesion || sesion.estado !== 'activo') throw new HttpError(409, 'La vista previa no esta arrancada.');
  avisar(sesion);
  return { ok: true, clientes: sesion.clientes.size };
}

/** Al salir de la aplicacion no se deja ningun puerto abierto. */
export function detenerTodos() {
  for (const projectId of [...registro.keys()]) void detener(projectId);
}
