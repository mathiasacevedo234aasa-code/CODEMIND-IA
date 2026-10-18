import { Router } from 'express';
import * as cacheDocs from '../services/cacheDocs.js';
import { comoPreferencias } from '../services/valoraciones.js';
import { generateFunctionDoc, chat, chatStream, listModels, testConnection } from '../services/ia.js';
import { listaProveedores } from '../services/proveedores.js';
import { comoTexto as glosarioComoTexto } from '../services/glosario.js';
import { getProject, readDocs, readMemory, readSettings } from '../services/store.js';

const router = Router();

/** Genera una propuesta de documentacion. NO la guarda: eso lo decide el usuario. */
router.post('/document', async (req, res, next) => {
  try {
    const { projectId, code, context = {}, model, extraInstruction, forzar } = req.body ?? {};
    // Respaldo: el usuario eligio reintentar con otro proveedor configurado.
    const proveedor = typeof req.body?.proveedor === 'string' && req.body.proveedor ? req.body.proveedor : null;
    const settings = await readSettings();

    if (projectId) {
      const project = await getProject(projectId);
      context.projectName ??= project.name;
      context.projectObjective ??= project.objective;
      // Un proyecto puede documentarse en otro idioma que el de la interfaz:
      // una libreria publica en ingles, por ejemplo, con la app en espanol.
      if (project.idiomaDoc) context.idioma ??= project.idiomaDoc;
      if (context.functionId) {
        const store = await readDocs(projectId);
        const approved = store.approved[context.functionId];
        if (approved) context.previousDoc = JSON.stringify(approved.doc, null, 2).slice(0, 4000);
      }
    }

    context.level ??= settings.explanationLevel;
    context.estilo ??= settings.estiloDoc ?? 'normal';
    context.idioma ??= settings.idioma ?? 'es';
    // Lo que el usuario dijo con 👎 en este proyecto, para no repetirlo.
    if (projectId && !context.preferencias) {
      const pref = await comoPreferencias(projectId);
      if (pref) context.preferencias = pref;
    }
    // El glosario aprobado tambien vale al documentar: si "pedido en firme"
    // significa algo concreto en este proyecto, la explicacion debe usarlo asi.
    if (projectId && !context.glosario) {
      const glosario = await glosarioComoTexto(projectId);
      if (glosario) context.glosario = glosario;
    }
    // Todo lo que cambia la respuesta entra en la huella.
    const clave = cacheDocs.huella({
      code,
      context,
      extraInstruction: extraInstruction ?? null,
      proveedor: proveedor ?? settings.proveedor,
      model: model ?? settings.modelos?.[proveedor ?? settings.proveedor] ?? null,
      temperature: settings.temperature,
    });
    if (!forzar) {
      const previo = await cacheDocs.leer(clave);
      if (previo) return res.json({ ...previo, cacheado: true });
    }
    const result = await generateFunctionDoc({
      code,
      context,
      model: model ?? null,
      proveedor,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      extraInstruction,
    });
    await cacheDocs.guardar(clave, result).catch(() => {});
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Lo que se le da al asistente como contexto. Es igual con y sin streaming,
 * asi que vive aparte para que las dos rutas no se desincronicen.
 */
async function prepararChat(body) {
  const { projectId, mode = 'comprehension', question, contextText = '', model, historial, proveedor } = body ?? {};
  const settings = await readSettings();
  let material = contextText;

  if (projectId && (mode === 'context' || mode === 'comprehension')) {
    const project = await getProject(projectId);
    const memory = await readMemory(projectId);
    const store = await readDocs(projectId);
    const approvedList = Object.values(store.approved).map(
      (v) => `- ${v.name} (${v.filePath}): ${v.doc?.proposito ?? ''}`,
    );
    // El glosario aprobado va siempre: es vocabulario que el usuario ya ha
    // dado por bueno, y sin el la IA interpreta a su manera las palabras
    // propias del proyecto.
    const glosario = await glosarioComoTexto(projectId);
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
      glosario ? `\n${glosario}` : '',
    ].filter(Boolean).join('\n');
    material = material ? `${projectBlock}\n\n${material}` : projectBlock;
  }

  return {
    mode,
    question,
    contextText: material,
    idioma: settings.idioma ?? 'es',
    historial,
    proveedor: typeof proveedor === 'string' && proveedor ? proveedor : null,
    model: model ?? null,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
  };
}

/** Asistente en sus cuatro modos. El modo "context" usa la memoria del proyecto. */
router.post('/chat', async (req, res, next) => {
  try {
    res.json(await chat(await prepararChat(req.body)));
  } catch (err) {
    next(err);
  }
});

/**
 * Lo mismo, pero el texto llega a trozos mientras se genera.
 *
 * Va como "server-sent events": `trozo` con cada pedazo de texto, `fin` con
 * el modelo que respondio, y `error` si algo falla a mitad. Si el usuario
 * cierra la peticion (cambia de proyecto, cancela), se corta tambien la
 * peticion al proveedor para no seguir pagando una respuesta que nadie lee.
 */
router.post('/chat/stream', async (req, res) => {
  const enviar = (evento, datos) => {
    if (!res.writableEnded) res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
  };
  // Ojo: el 'close' que vale es el de la RESPUESTA. El de la peticion salta en
  // cuanto se ha leido su cuerpo, o sea nada mas empezar, y cortaba la
  // respuesta antes del primer trozo.
  const corte = new AbortController();
  res.on('close', () => { if (!res.writableEnded) corte.abort(); });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    // Que ningun proxy intermedio se guarde los trozos para mandarlos juntos.
    'X-Accel-Buffering': 'no',
  });

  try {
    const opciones = await prepararChat(req.body);
    const resultado = await chatStream(opciones, (trozo) => enviar('trozo', { t: trozo }), { senal: corte.signal });
    enviar('fin', { model: resultado.model, proveedor: resultado.proveedor });
  } catch (err) {
    if (!corte.signal.aborted) enviar('error', { error: err.message, status: err.status ?? 500 });
  } finally {
    res.end();
  }
});

/** Que proveedores conoce la aplicacion. No dice cuales estan configurados. */
router.get('/proveedores', (_req, res) => {
  res.json({ proveedores: listaProveedores() });
});

/** Comprueba de verdad la conexion, no solo que exista una clave. */
router.get('/test', async (req, res, next) => {
  try {
    res.json(await testConnection(req.query.proveedor || null));
  } catch (err) {
    next(err);
  }
});

router.get('/models', async (req, res, next) => {
  try {
    res.json({ models: await listModels(req.query.proveedor || null) });
  } catch (err) {
    next(err);
  }
});

export default router;
