import { Router } from 'express';
import { generateFunctionDoc, chat, listModels, testConnection } from '../services/groq.js';
import { getProject, readDocs, readMemory, readSettings } from '../services/store.js';

const router = Router();

/** Genera una propuesta de documentacion. NO la guarda: eso lo decide el usuario. */
router.post('/document', async (req, res, next) => {
  try {
    const { projectId, code, context = {}, model, extraInstruction } = req.body ?? {};
    const settings = await readSettings();

    if (projectId) {
      const project = await getProject(projectId);
      context.projectName ??= project.name;
      context.projectObjective ??= project.objective;
      if (context.functionId) {
        const store = await readDocs(projectId);
        const approved = store.approved[context.functionId];
        if (approved) context.previousDoc = JSON.stringify(approved.doc, null, 2).slice(0, 4000);
      }
    }

    context.level ??= settings.explanationLevel;
    const result = await generateFunctionDoc({
      code,
      context,
      model: model ?? settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      extraInstruction,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Asistente en sus cuatro modos. El modo "context" usa la memoria del proyecto. */
router.post('/chat', async (req, res, next) => {
  try {
    const { projectId, mode = 'comprehension', question, contextText = '', model } = req.body ?? {};
    const settings = await readSettings();
    let material = contextText;

    if (projectId && (mode === 'context' || mode === 'comprehension')) {
      const project = await getProject(projectId);
      const memory = await readMemory(projectId);
      const store = await readDocs(projectId);
      const approvedList = Object.values(store.approved).map(
        (v) => `- ${v.name} (${v.filePath}): ${v.doc?.proposito ?? ''}`,
      );
      const projectBlock = [
        `Proyecto: ${project.name}`,
        `Objetivo declarado: ${project.objective || '(no registrado)'}`,
        '',
        'Memoria contextual del proyecto:',
        JSON.stringify(memory, null, 2).slice(0, 6000),
        '',
        approvedList.length
          ? `Funciones con documentacion aprobada:\n${approvedList.join('\n')}`
          : 'Todavia no hay funciones con documentacion aprobada.',
      ].join('\n');
      material = material ? `${projectBlock}\n\n${material}` : projectBlock;
    }

    const result = await chat({
      mode,
      question,
      level: settings.explanationLevel,
      contextText: material,
      model: model ?? settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Comprueba de verdad la conexion con Groq, no solo que exista una clave. */
router.get('/test', async (_req, res, next) => {
  try {
    res.json(await testConnection());
  } catch (err) {
    next(err);
  }
});

router.get('/models', async (_req, res, next) => {
  try {
    res.json({ models: await listModels() });
  } catch (err) {
    next(err);
  }
});

export default router;
