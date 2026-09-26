import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getProject, projectRootDir } from '../services/store.js';
import * as fsbrowse from '../services/fsbrowse.js';
import * as git from '../services/git.js';
import * as github from '../services/github.js';
import * as runner from '../services/runner.js';
import * as search from '../services/search.js';
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
  res.json(await github.pull(await rootOf(req), req.body?.branch));
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

/** Aplica el reemplazo. Llega aqui solo tras confirmarlo el usuario. */
router.post('/projects/:id/replace/apply', wrap(async (req, res) => {
  await getProject(req.params.id);
  res.json(await search.reemplazar(req.params.id, req.body ?? {}, true));
}));

// ------------------------------------------------------ exportar documentacion

router.get('/projects/:id/docs/export', wrap(async (req, res) => {
  const formato = req.query.format === 'html' ? 'html' : 'md';
  const resultado = await exportarDocumentacion(req.params.id, formato);
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
