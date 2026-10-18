import { Router } from 'express';
import {
  getProject,
  readDocs,
  writeDocs,
  readHistory,
  writeHistory,
  newId,
  readSettings,
} from '../services/store.js';
import { validateDoc, traducirDoc } from '../services/ia.js';
import * as glosario from '../services/glosario.js';

const router = Router();

/** Pasa los fallos al manejador de errores sin repetir try/catch en cada ruta. */
const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
};

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

/**
 * Version bilingue. POST genera la traduccion (no guarda nada); PUT guarda
 * la que el usuario acepto. Las traducciones viven junto a la documentacion
 * aprobada, en `traducciones[idioma]`, y quedan obsoletas si esta cambia.
 */
router.post('/:id/docs/:functionId/traduccion', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const store = await readDocs(req.params.id);
    const entry = store.approved[req.params.functionId];
    if (!entry) return res.status(404).json({ error: 'Ese elemento no tiene documentacion aprobada.' });
    const idioma = req.body?.idioma === 'es' ? 'es' : 'en';
    const settings = await readSettings();
    res.json(await traducirDoc({ doc: entry.doc, idioma, temperature: settings.temperature, maxTokens: settings.maxTokens }));
  } catch (err) {
    next(err);
  }
});

router.put('/:id/docs/:functionId/traduccion', async (req, res, next) => {
  try {
    await getProject(req.params.id);
    const store = await readDocs(req.params.id);
    const entry = store.approved[req.params.functionId];
    if (!entry) return res.status(404).json({ error: 'Ese elemento no tiene documentacion aprobada.' });
    const idioma = req.body?.idioma === 'es' ? 'es' : 'en';
    if (!req.body?.doc || typeof req.body.doc !== 'object') return res.status(400).json({ error: 'Falta la traduccion.' });
    // Se apunta de que version es la traduccion, para saber si se queda vieja.
    entry.traducciones = { ...(entry.traducciones ?? {}), [idioma]: { doc: req.body.doc, de: entry.versionId, en: new Date().toISOString() } };
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

// ------------------------------------------------------------- glosario

/**
 * El vocabulario propio del proyecto. La IA propone y el usuario aprueba:
 * ningun termino entra en el glosario sin que una persona lo lea.
 */
router.get('/:id/glosario', wrap(async (req, res) => {
  res.json(await glosario.obtener(req.params.id));
}));

router.post('/:id/glosario/proponer', wrap(async (req, res) => {
  const ajustes = await readSettings();
  res.json(await glosario.proponer(req.params.id, {
    elementos: req.body?.elementos ?? [],
    temperature: ajustes.temperature,
    maxTokens: ajustes.maxTokens,
  }));
}));

router.post('/:id/glosario', wrap(async (req, res) => {
  res.status(201).json(await glosario.anadirTermino(req.params.id, req.body ?? {}));
}));

router.put('/:id/glosario/:terminoId', wrap(async (req, res) => {
  res.json(await glosario.editarTermino(req.params.id, req.params.terminoId, req.body ?? {}));
}));

router.delete('/:id/glosario/:terminoId', wrap(async (req, res) => {
  res.json(await glosario.borrarTermino(req.params.id, req.params.terminoId));
}));

router.post('/:id/glosario/propuestas/:propuestaId/aprobar', wrap(async (req, res) => {
  res.json(await glosario.aprobarPropuesta(req.params.id, req.params.propuestaId));
}));

router.delete('/:id/glosario/propuestas/:propuestaId', wrap(async (req, res) => {
  res.json(await glosario.descartarPropuesta(req.params.id, req.params.propuestaId));
}));

export default router;
