import { Router } from 'express';
import {
  getProject,
  readDocs,
  writeDocs,
  readHistory,
  writeHistory,
  newId,
} from '../services/store.js';
import { validateDoc } from '../services/groq.js';

const router = Router();

/** Estado completo de documentacion: aprobadas + propuestas pendientes (separadas). */
router.get('/:id/docs', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    res.json(await readDocs(req.params.id));
  } catch (err) {
    next(err);
  }
});

/** Guarda una propuesta pendiente. Nunca toca la documentacion oficial. */
router.post('/:id/proposals', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const { functionId, name, filePath, codeHash, code, doc, model, kind } = req.body ?? {};
    if (!functionId || !doc) return res.status(400).json({ error: 'Faltan functionId o doc.' });

    const store = await readDocs(req.params.id);
    const proposal = {
      id: newId('prop'),
      functionId,
      name: name ?? doc.nombre ?? '',
      filePath: filePath ?? '',
      codeHash: codeHash ?? null,
      code: code ?? '',
      kind: kind ?? 'funcion',
      doc,
      model: model ?? null,
      createdAt: new Date().toISOString(),
      edited: false,
    };
    // Una regeneracion sustituye la propuesta pendiente de esa misma funcion,
    // pero jamas la version aprobada.
    store.proposals = store.proposals.filter((p) => p.functionId !== functionId);
    store.proposals.unshift(proposal);
    await writeDocs(req.params.id, store);
    res.status(201).json({ proposal, proposals: store.proposals });
  } catch (err) {
    next(err);
  }
});

/** Edicion manual de una propuesta antes de aprobarla. */
router.patch('/:id/proposals/:proposalId', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const store = await readDocs(req.params.id);
    const proposal = store.proposals.find((p) => p.id === req.params.proposalId);
    if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada.' });
    if (req.body?.doc) {
      proposal.doc = req.body.doc;
      proposal.edited = true;
      proposal.editedAt = new Date().toISOString();
    }
    await writeDocs(req.params.id, store);
    res.json({ proposal, proposals: store.proposals });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/proposals/:proposalId', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const store = await readDocs(req.params.id);
    store.proposals = store.proposals.filter((p) => p.id !== req.params.proposalId);
    await writeDocs(req.params.id, store);
    res.json({ proposals: store.proposals });
  } catch (err) {
    next(err);
  }
});

/**
 * Aprobacion humana explicita: la propuesta pasa a documentacion oficial y
 * la version anterior se conserva en el historial.
 */
router.post('/:id/proposals/:proposalId/approve', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const store = await readDocs(req.params.id);
    const proposal = store.proposals.find((p) => p.id === req.params.proposalId);
    if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada.' });

    const validation = validateDoc(proposal.doc, proposal.kind);
    if (!validation.ok) {
      return res.status(422).json({
        error: 'La propuesta esta incompleta y no puede aprobarse.',
        problems: validation.problems,
      });
    }

    const history = await readHistory(req.params.id);
    const previous = store.approved[proposal.functionId];
    if (previous) history.versions.unshift({ ...previous });

    const version = {
      versionId: newId('ver'),
      functionId: proposal.functionId,
      name: proposal.name,
      filePath: proposal.filePath,
      codeHash: proposal.codeHash,
      code: proposal.code,
      kind: proposal.kind ?? 'funcion',
      doc: proposal.doc,
      approvedAt: new Date().toISOString(),
      model: proposal.model,
      edited: proposal.edited,
    };
    store.approved[proposal.functionId] = version;
    store.proposals = store.proposals.filter((p) => p.id !== proposal.id);

    await writeDocs(req.params.id, store);
    await writeHistory(req.params.id, history);
    res.json({ approved: store.approved, proposals: store.proposals, version });
  } catch (err) {
    next(err);
  }
});

/** Reasigna la documentacion aprobada cuando una funcion se renombra o se mueve. */
router.post('/:id/docs/relink', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const { fromFunctionId, toFunctionId, name, filePath } = req.body ?? {};
    const store = await readDocs(req.params.id);
    const entry = store.approved[fromFunctionId];
    if (!entry) return res.status(404).json({ error: 'No hay documentacion aprobada para esa funcion.' });
    delete store.approved[fromFunctionId];
    entry.functionId = toFunctionId;
    if (name) entry.name = name;
    if (filePath) entry.filePath = filePath;
    entry.relinkedAt = new Date().toISOString();
    store.approved[toFunctionId] = entry;
    await writeDocs(req.params.id, store);
    res.json({ approved: store.approved });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/docs/:functionId', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const store = await readDocs(req.params.id);
    const entry = store.approved[req.params.functionId];
    if (entry) {
      const history = await readHistory(req.params.id);
      history.versions.unshift({ ...entry, removedAt: new Date().toISOString() });
      await writeHistory(req.params.id, history);
      delete store.approved[req.params.functionId];
      await writeDocs(req.params.id, store);
    }
    res.json({ approved: store.approved });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/history', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const history = await readHistory(req.params.id);
    const { functionId } = req.query;
    res.json({
      versions: functionId ? history.versions.filter((v) => v.functionId === functionId) : history.versions,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
