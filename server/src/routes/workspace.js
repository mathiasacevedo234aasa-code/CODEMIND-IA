import { Router } from 'express';
import { getProject, projectRootDir } from '../services/store.js';
import * as fsbrowse from '../services/fsbrowse.js';
import * as git from '../services/git.js';
import * as github from '../services/github.js';
import * as runner from '../services/runner.js';

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

router.get('/net/probe', wrap(async (req, res) => {
  res.json(await runner.probeUrl(String(req.query.url ?? '')));
}));

export default router;
