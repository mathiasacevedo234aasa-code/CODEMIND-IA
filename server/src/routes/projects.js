import { Router } from 'express';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  readTree,
  readFileContent,
  writeFileContent,
  createEntry,
  renameEntry,
  deleteEntry,
  readMemory,
  writeMemory,
  newId,
} from '../services/store.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    res.json({ projects: await listProjects() });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json({ project: await createProject(req.body ?? {}) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    res.json({ project: await getProject(req.params.id) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    res.json({ project: await updateProject(req.params.id, req.body ?? {}) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await deleteProject(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ archivos

router.get('/:id/tree', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    res.json(await readTree(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/file', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    res.json(await readFileContent(req.params.id, req.query.path));
  } catch (err) {
    next(err);
  }
});

router.put('/:id/file', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const { path: relPath, content } = req.body ?? {};
    res.json(await writeFileContent(req.params.id, relPath, content));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/entry', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const { path: relPath, kind } = req.body ?? {};
    res.status(201).json(await createEntry(req.params.id, relPath, kind === 'dir' ? 'dir' : 'file'));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/rename', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const { from, to } = req.body ?? {};
    res.json(await renameEntry(req.params.id, from, to));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/entry', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    res.json(await deleteEntry(req.params.id, req.query.path));
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------- memoria

router.get('/:id/memory', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    res.json({ memory: await readMemory(req.params.id) });
  } catch (err) {
    next(err);
  }
});

/** Guarda la memoria contextual. Solo llega aqui contenido ya aprobado por el usuario. */
router.put('/:id/memory', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const current = await readMemory(req.params.id);
    const incoming = req.body?.memory ?? {};
    const next_ = {
      ...current,
      ...incoming,
      overview: { ...current.overview, ...(incoming.overview ?? {}) },
      decisions: Array.isArray(incoming.decisions) ? incoming.decisions : current.decisions,
      progress: Array.isArray(incoming.progress) ? incoming.progress : current.progress,
      updatedAt: new Date().toISOString(),
    };
    await writeMemory(req.params.id, next_);
    res.json({ memory: next_ });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/memory/decisions', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const memory = await readMemory(req.params.id);
    const { title, rationale = '', tags = [] } = req.body ?? {};
    if (!title?.trim()) return res.status(400).json({ error: 'La decision necesita un titulo.' });
    memory.decisions.unshift({
      id: newId('dec'),
      title: title.trim(),
      rationale,
      tags,
      createdAt: new Date().toISOString(),
    });
    memory.updatedAt = new Date().toISOString();
    await writeMemory(req.params.id, memory);
    res.status(201).json({ memory });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/memory/decisions/:decisionId', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const memory = await readMemory(req.params.id);
    memory.decisions = memory.decisions.filter((d) => d.id !== req.params.decisionId);
    memory.updatedAt = new Date().toISOString();
    await writeMemory(req.params.id, memory);
    res.json({ memory });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/memory/progress', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const memory = await readMemory(req.params.id);
    const { title, detail = '', state = 'pendiente' } = req.body ?? {};
    if (!title?.trim()) return res.status(400).json({ error: 'La entrada necesita un titulo.' });
    memory.progress.unshift({
      id: newId('prg'),
      title: title.trim(),
      detail,
      state,
      createdAt: new Date().toISOString(),
    });
    memory.updatedAt = new Date().toISOString();
    await writeMemory(req.params.id, memory);
    res.status(201).json({ memory });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/memory/progress/:entryId', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const memory = await readMemory(req.params.id);
    const entry = memory.progress.find((p) => p.id === req.params.entryId);
    if (!entry) return res.status(404).json({ error: 'Entrada de progreso no encontrada.' });
    Object.assign(entry, req.body ?? {}, { id: entry.id, createdAt: entry.createdAt });
    memory.updatedAt = new Date().toISOString();
    await writeMemory(req.params.id, memory);
    res.json({ memory });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/memory/progress/:entryId', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const memory = await readMemory(req.params.id);
    memory.progress = memory.progress.filter((p) => p.id !== req.params.entryId);
    memory.updatedAt = new Date().toISOString();
    await writeMemory(req.params.id, memory);
    res.json({ memory });
  } catch (err) {
    next(err);
  }
});

export default router;
