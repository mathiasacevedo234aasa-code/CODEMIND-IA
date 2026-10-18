import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getProject, projectRootDir, HttpError } from '../services/store.js';
import * as fsbrowse from '../services/fsbrowse.js';
import * as git from '../services/git.js';
import * as github from '../services/github.js';
import * as runner from '../services/runner.js';
import * as ejecuciones from '../services/ejecuciones.js';
import { resumir } from '../services/resumenes.js';
import { estadisticas } from '../services/estadisticas.js';
import * as search from '../services/search.js';
import * as quality from '../services/quality.js';
import * as terminal from '../services/terminal.js';
import * as lenguajes from '../services/lenguajes.js';
import * as live from '../services/liveserver.js';
import { exportarDocumentacion } from '../services/export.js';

/**
 * Rutas de entorno: disco, control de versiones, GitHub y ejecucion.
 * Ninguna operacion destructiva ocurre sin una peticion explicita del usuario.
 */
const router = Router();

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

/** Carpeta real del proyecto, que es sobre la que trabajan git y los procesos. */
const rootOf = (req) => projectRootDir(req.params.id);

// ---------------------------------------------------------- disco del equipo

router.get('/fs/roots', wrap(async (_req, res) => {
  res.json({ roots: await fsbrowse.roots() });
}));

router.get('/fs/list', wrap(async (req, res) => {
  res.json(await fsbrowse.list(req.query.path, req.query.hidden === '1'));
}));

router.post('/fs/folder', wrap(async (req, res) => {
  const { parent, name } = req.body ?? {};
  res.status(201).json(await fsbrowse.createFolder(parent, name));
}));

router.get('/fs/probe', wrap(async (req, res) => {
  const probe = await fsbrowse.probe(req.query.path);
  const safety = probe.isDir ? fsbrowse.isSafeProjectRoot(probe.path) : { ok: false };
  res.json({ ...probe, safe: safety.ok, unsafeReason: safety.reason ?? null });
}));

// ------------------------------------------------------------------ git

router.get('/projects/:id/git/status', wrap(async (req, res) => {
  await getProject(req.params.id);
  res.json(await git.status(await rootOf(req)));
}));

router.post('/projects/:id/git/init', wrap(async (req, res) => {
  res.json({ ok: true, ...(await git.init(await rootOf(req))) });
}));

router.get('/projects/:id/git/diff', wrap(async (req, res) => {
  res.json(await git.diff(await rootOf(req), req.query.path, req.query.staged === '1'));
}));

router.post('/projects/:id/git/stage', wrap(async (req, res) => {
  const cwd = await rootOf(req);
  await git.stage(cwd, req.body?.paths);
  res.json(await git.status(cwd));
}));

router.post('/projects/:id/git/unstage', wrap(async (req, res) => {
  const cwd = await rootOf(req);
  await git.unstage(cwd, req.body?.paths);
  res.json(await git.status(cwd));
}));

router.post('/projects/:id/git/commit', wrap(async (req, res) => {
  const cwd = await rootOf(req);
  const commit = await git.commit(cwd, req.body?.message);
  res.json({ commit, status: await git.status(cwd) });
}));

router.get('/projects/:id/git/log', wrap(async (req, res) => {
  res.json({ commits: await git.log(await rootOf(req), Number(req.query.limit) || 40) });
}));

router.get('/projects/:id/git/branches', wrap(async (req, res) => {
  res.json(await git.branches(await rootOf(req)));
}));

router.post('/projects/:id/git/checkout', wrap(async (req, res) => {
  const cwd = await rootOf(req);
  await git.checkout(cwd, req.body?.branch, Boolean(req.body?.create));
  res.json({ status: await git.status(cwd) });
}));

router.get('/projects/:id/git/versiones', wrap(async (req, res) => {
  res.json(await git.versiones(await rootOf(req), req.query.path, req.query.staged === '1'));
}));

router.post('/projects/:id/git/deshacer-commit', wrap(async (req, res) => {
  const cwd = await rootOf(req);
  const r = await git.deshacerUltimoCommit(cwd);
  res.json({ ...r, status: await git.status(cwd) });
}));

/** Los ultimos commits con los archivos que toco cada uno, para la linea de tiempo del mapa. */
router.get('/projects/:id/git/linea-tiempo', wrap(async (req, res) => {
  const cwd = await rootOf(req);
  const n = Math.min(200, Math.max(1, Number(req.query.n) || 40));
  const r = await git.run(cwd, ['log', '-n', String(n), '--name-only', '--format=%x1e%h%x1f%ad%x1f%an%x1f%s', '--date=short'], { allowFailure: true });
  if (r.code !== 0) return res.json({ commits: [] });
  const commits = r.stdout.split(String.fromCharCode(30)).filter((b) => b.trim()).map((b) => {
    const [cabecera, ...resto] = b.split(/\r?\n/);
    const [hash, fecha, autor, asunto] = cabecera.split(String.fromCharCode(31));
    return { hash, fecha, autor, asunto, archivos: resto.map((l) => l.trim()).filter(Boolean) };
  });
  res.json({ commits });
}));

router.get('/projects/:id/git/stash', wrap(async (req, res) => {
  res.json({ lista: await git.stashListar(await rootOf(req)) });
}));

router.post('/projects/:id/git/stash', wrap(async (req, res) => {
  const cwd = await rootOf(req);
  const b = req.body ?? {};
  let r;
  if (b.accion === 'recuperar') r = await git.stashRecuperar(cwd, b.ref);
  else if (b.accion === 'descartar') r = await git.stashDescartar(cwd, b.ref);
  else r = await git.stashGuardar(cwd, b.mensaje);
  res.json({ ...r, status: await git.status(cwd) });
}));

// --------------------------------------------------------------- github

router.get('/github/status', wrap(async (_req, res) => {
  res.json(await github.status());
}));

router.put('/github/token', wrap(async (req, res) => {
  await github.setToken(req.body?.token);
  res.json(await github.status());
}));

router.delete('/github/token', wrap(async (_req, res) => {
  await github.clearToken();
  res.json(await github.status());
}));

router.get('/github/repos', wrap(async (req, res) => {
  res.json({ repos: await github.repos(String(req.query.q ?? '')) });
}));

router.post('/projects/:id/github/link', wrap(async (req, res) => {
  res.json(await github.link(await rootOf(req), req.body?.fullName));
}));

router.delete('/projects/:id/github/link', wrap(async (req, res) => {
  await github.unlink(await rootOf(req));
  res.json({ ok: true });
}));

router.get('/projects/:id/github/preview', wrap(async (req, res) => {
  res.json(await github.preview(await rootOf(req)));
}));

router.post('/projects/:id/github/push', wrap(async (req, res) => {
  res.json(await github.push(await rootOf(req), req.body?.branch, Boolean(req.body?.setUpstream)));
}));

router.post('/projects/:id/github/pull', wrap(async (req, res) => {
  res.json(await github.pullCon(await rootOf(req), req.body?.branch, req.body?.modo ?? 'ff'));
}));

router.get('/projects/:id/github/pull/previa', wrap(async (req, res) => {
  res.json(await github.previaPull(await rootOf(req), req.query.branch));
}));

router.post('/projects/:id/github/pull/abortar', wrap(async (req, res) => {
  res.json(await github.abortarPull(await rootOf(req)));
}));

router.get('/projects/:id/estadisticas', wrap(async (req, res) => {
  await getProject(req.params.id);
  res.json(await estadisticas(req.params.id, await rootOf(req)));
}));

router.post('/projects/:id/resumen', wrap(async (req, res) => {
  await getProject(req.params.id);
  res.json(await resumir(req.params.id, await rootOf(req), req.body?.tipo === 'semanal' ? 'semanal' : 'commits'));
}));

router.get('/projects/:id/ejecuciones', wrap(async (req, res) => {
  await getProject(req.params.id);
  res.json({ ejecuciones: await ejecuciones.listar(req.params.id) });
}));

router.get('/projects/:id/ejecuciones/:eid', wrap(async (req, res) => {
  await getProject(req.params.id);
  res.json({ ejecucion: await ejecuciones.leer(req.params.id, req.params.eid) });
}));

// --------------------------------------------------------------- busqueda

router.post('/projects/:id/search', wrap(async (req, res) => {
  await getProject(req.params.id);
  res.json(await search.buscar(req.params.id, req.body ?? {}));
}));

/** Solo calcula el resultado: no escribe nada en el disco. */
router.post('/projects/:id/replace/preview', wrap(async (req, res) => {
  await getProject(req.params.id);
  res.json(await search.reemplazar(req.params.id, req.body ?? {}, false));
}));

/** Deshace el ultimo "Reemplazar todo", si nada se ha tocado despues. */
router.post('/projects/:id/replace/deshacer', wrap(async (req, res) => {
  await getProject(req.params.id);
  res.json(await search.deshacerReemplazo(req.params.id));
}));

/** Aplica el reemplazo. Llega aqui solo tras confirmarlo el usuario. */
router.post('/projects/:id/replace/apply', wrap(async (req, res) => {
  await getProject(req.params.id);
  res.json(await search.reemplazar(req.params.id, req.body ?? {}, true));
}));

// ------------------------------------------------------ exportar documentacion

router.get('/projects/:id/docs/export', wrap(async (req, res) => {
  const formato = ['html', 'pdf', 'docx'].includes(req.query.format) ? req.query.format : 'md';
  const resultado = await exportarDocumentacion(req.params.id, formato, { bilingue: req.query.bilingue === '1' });
  res.json(resultado);
}));

// -------------------------------------------------------------- ejecucion

router.get('/projects/:id/run/scripts', wrap(async (req, res) => {
  res.json(await runner.scripts(await rootOf(req)));
}));

router.post('/projects/:id/run/start', wrap(async (req, res) => {
  const { script, command, args, label } = req.body ?? {};
  res.json({ process: await runner.start(req.params.id, await rootOf(req), { script, command, args, label }) });
}));

router.get('/projects/:id/run/processes', wrap(async (req, res) => {
  res.json({ processes: runner.listProcesses(req.params.id) });
}));

router.get('/projects/:id/run/processes/:processId/logs', wrap(async (req, res) => {
  res.json(runner.logs(req.params.id, req.params.processId, Number(req.query.since) || 0));
}));

// ------------------------------------------- vista previa en vivo

/**
 * Un servidor HTTP de verdad sobre la carpeta del proyecto.
 *
 * No es un iframe con el HTML dentro: es http://127.0.0.1 con su origen, asi
 * que las rutas relativas, fetch y los modulos de JavaScript se comportan como
 * se comportaran de verdad. Ademas recarga sola al guardar.
 */
router.get('/projects/:id/preview', wrap(async (req, res) => {
  res.json(live.estado(req.params.id));
}));

router.post('/projects/:id/preview', wrap(async (req, res) => {
  res.json(await live.arrancar(req.params.id, await rootOf(req), { puerto: req.body?.puerto }));
}));

router.post('/projects/:id/preview/recargar', wrap(async (req, res) => {
  res.json(live.recargar(req.params.id));
}));

router.delete('/projects/:id/preview', wrap(async (req, res) => {
  res.json(await live.detener(req.params.id));
}));

// ------------------------------------------------- ejecutar un archivo

/** Que lenguajes puede ejecutar este equipo ahora mismo. */
router.get('/lenguajes', wrap(async (req, res) => {
  res.json({ lenguajes: await lenguajes.resumen({ refrescar: req.query.refrescar === '1' }) });
}));

/** Como se ejecutaria este archivo. No ejecuta nada: solo lo explica. */
router.get('/projects/:id/ejecutar/plan', wrap(async (req, res) => {
  res.json(await lenguajes.planPara(await rootOf(req), req.query.path));
}));

/**
 * Ejecuta el archivo abierto en el terminal del proyecto.
 *
 * Va al terminal y no a un proceso aparte a proposito: un programa que pide
 * datos por teclado se quedaria colgado para siempre sin un terminal de
 * verdad. Ademas el comando queda escrito, que es la mejor forma de aprender
 * cual era.
 */
router.post('/projects/:id/ejecutar/archivo', wrap(async (req, res) => {
  const raiz = await rootOf(req);
  const plan = await lenguajes.planPara(raiz, req.body?.path);

  if (!plan.soportado) throw new HttpError(400, plan.motivo);
  if (!plan.disponible) throw new HttpError(409, plan.motivo);

  // Se reutiliza la consola que ya estuviera abierta: abrir una nueva con
  // cada ejecucion dejaria el proyecto lleno de consolas sueltas. Si hay
  // varias pestañas, va a la que el usuario tiene delante.
  const vivas = terminal.listar(req.params.id).filter((s) => s.estado === 'viva');
  const preferida = vivas.findIndex((s) => s.id === req.body?.sesion);
  if (preferida > 0) vivas.unshift(...vivas.splice(preferida, 1));
  const sesion = vivas[0] ?? (await terminal.abrir(req.params.id, raiz, req.body ?? {}));

  // Una consola recien abierta no esta lista de inmediato: escribirle antes
  // de que saque su prompt dejaba el comando a medias, sin ejecutarse nunca.
  if (!vivas.length) await terminal.esperarListo(req.params.id, sesion.id);

  // El retorno de carro es lo que envia la orden. Se escribe como codigo
  // explicito: un salto de linea normal deja a PowerShell esperando mas.
  const ENVIAR = String.fromCharCode(13);
  terminal.escribir(req.params.id, sesion.id, plan.comando + ENVIAR);
  res.json({ sesion, plan, reutilizada: vivas.length > 0 });
}));

// ----------------------------------------------------------------- consola

/** Nombre y correo de git del usuario (para cabeceras de licencia). */
router.get('/git/usuario', wrap(async (_req, res) => {
  const leer = async (clave) => (await git.run(process.cwd(), ['config', '--global', clave], { allowFailure: true }).catch(() => ({ stdout: '' }))).stdout.trim() || null;
  res.json({ nombre: await leer('user.name'), correo: await leer('user.email') });
}));

router.get('/terminal/disponibilidad', wrap(async (_req, res) => {
  res.json(await terminal.disponibilidad());
}));

router.get('/projects/:id/terminal', wrap(async (req, res) => {
  res.json({ sesiones: terminal.listar(req.params.id) });
}));

router.post('/projects/:id/terminal', wrap(async (req, res) => {
  const { cols, rows, perfil } = req.body ?? {};
  res.status(201).json({ sesion: await terminal.abrir(req.params.id, await rootOf(req), { cols, rows, perfil }) });
}));

router.get('/projects/:id/terminal/:sid', wrap(async (req, res) => {
  res.json(terminal.leer(req.params.id, req.params.sid, Number(req.query.desde) || 0));
}));

router.post('/projects/:id/terminal/:sid/escribir', wrap(async (req, res) => {
  res.json({ sesion: terminal.escribir(req.params.id, req.params.sid, req.body?.datos) });
}));

router.post('/projects/:id/terminal/:sid/tamano', wrap(async (req, res) => {
  const { cols, rows } = req.body ?? {};
  res.json({ sesion: terminal.redimensionar(req.params.id, req.params.sid, Number(cols), Number(rows)) });
}));

router.post('/projects/:id/terminal/:sid/interrumpir', wrap(async (req, res) => {
  res.json({ sesion: terminal.interrumpir(req.params.id, req.params.sid) });
}));

router.delete('/projects/:id/terminal/:sid', wrap(async (req, res) => {
  res.json(terminal.cerrar(req.params.id, req.params.sid));
}));

// --------------------------------------------------------- comprobaciones

router.get('/projects/:id/checks', wrap(async (req, res) => {
  res.json(await quality.tareas(await rootOf(req)));
}));

router.post('/projects/:id/checks/run', wrap(async (req, res) => {
  res.json(await quality.ejecutar(await rootOf(req), String(req.body?.script ?? '')));
}));

router.post('/projects/:id/run/processes/:processId/stop', wrap(async (req, res) => {
  res.json({ process: await runner.stop(req.params.id, req.params.processId) });
}));

/*
 * Vista previa accesible por URL.
 *
 * El boton "abrir en otra pestana" usaba window.open + document.write, que en
 * la aplicacion de escritorio no funciona: Electron deniega las ventanas
 * nuevas y el boton se quedaba muerto. Guardando el HTML aqui y sirviendolo en
 * una URL, la pagina se puede abrir tanto en una pestana interna como en el
 * navegador del sistema, y funciona igual en los dos modos.
 */
const previews = new Map();
const PREVIEW_TTL = 30 * 60 * 1000;

router.post('/preview', wrap(async (req, res) => {
  const html = String(req.body?.html ?? '');
  if (!html) return res.status(400).json({ error: 'No se recibio el contenido de la vista previa.' });

  // Se descartan las caducadas para no acumular HTML en memoria.
  const ahora = Date.now();
  for (const [key, value] of previews) if (ahora - value.at > PREVIEW_TTL) previews.delete(key);

  const id = randomUUID();
  previews.set(id, { html, at: ahora });
  res.status(201).json({ id, url: `/api/preview/${id}` });
}));

router.get('/preview/:id', wrap(async (req, res) => {
  const entry = previews.get(req.params.id);
  if (!entry) return res.status(404).type('html').send('<h1>La vista previa ha caducado</h1><p>Vuelve a generarla desde CodeMind AI.</p>');
  res.type('html').send(entry.html);
}));

router.get('/net/probe', wrap(async (req, res) => {
  res.json(await runner.probeUrl(String(req.query.url ?? '')));
}));

export default router;
