import { run, gitAvailable } from './git.js';
import { completar } from './proveedores.js';
import { HttpError, readDocs, readMemory, readSettings } from './store.js';
import { modeloDeTarea } from './tareas.js';

/**
 * Resúmenes escritos por la IA a partir de hechos: el historial de git, la
 * documentación aprobada y el registro de progreso. La IA solo resume lo que
 * se le da; si una semana no hubo nada, lo dice.
 */

const SISTEMA = [
  'Eres el asistente de CodeMind AI. Resumes la actividad de un proyecto de software a partir SOLO del material dado.',
  'No inventes trabajo que no aparezca. Agrupa por temas, no repitas los mensajes de commit tal cual.',
  'Responde en Markdown breve: un parrafo de resumen y despues una lista de puntos.',
].join(' ');

async function log(cwd, args) {
  const r = await run(cwd, ['log', ...args, '--date=short', '--format=%h %ad %an: %s', '--stat=100'], { allowFailure: true });
  return r.code === 0 ? r.stdout.slice(0, 15000) : '';
}

export async function resumir(projectId, cwd, tipo = 'commits') {
  const settings = await readSettings();
  const idioma = settings.idioma === 'en' ? 'Answer in English.' : 'Responde en espanol.';
  const partes = [];
  const hayGit = (await gitAvailable()).available && (await run(cwd, ['rev-parse', '--is-inside-work-tree'], { allowFailure: true })).code === 0;

  if (tipo === 'semanal') {
    const desde = new Date(Date.now() - 7 * 86400000);
    if (hayGit) partes.push(`Commits de los ultimos 7 dias:\n${(await log(cwd, ['--since=7.days'])) || '(ninguno)'}`);
    const docs = await readDocs(projectId);
    const aprobadas = Object.values(docs.approved).filter((d) => new Date(d.approvedAt) >= desde).map((d) => `- ${d.name} (${d.filePath})`);
    partes.push(`Documentacion aprobada esta semana:\n${aprobadas.join('\n') || '(ninguna)'}`);
    const memoria = await readMemory(projectId);
    const progreso = (memoria.progress ?? []).filter((p) => new Date(p.updatedAt ?? p.createdAt ?? 0) >= desde).map((p) => `- [${p.state}] ${p.title}`);
    partes.push(`Registro de progreso actualizado esta semana:\n${progreso.join('\n') || '(nada)'}`);
    const decisiones = (memoria.decisions ?? []).filter((d) => new Date(d.createdAt ?? 0) >= desde).map((d) => `- ${d.title}`);
    partes.push(`Decisiones registradas esta semana:\n${decisiones.join('\n') || '(ninguna)'}`);
  } else {
    if (!hayGit) throw new HttpError(400, 'Este proyecto no es un repositorio de git: no hay commits que resumir.');
    partes.push(`Ultimos commits (los mas recientes primero):\n${(await log(cwd, ['-n', '30'])) || '(ninguno)'}`);
  }

  const t = modeloDeTarea(settings, 'asistente');
  const r = await completar({
    messages: [
      { role: 'system', content: `${SISTEMA} ${idioma}` },
      {
        role: 'user',
        content: `${tipo === 'semanal' ? 'Escribe el resumen de la semana del proyecto.' : 'Resume estos commits: que se hizo y que areas del codigo cambiaron.'}\n\n${partes.join('\n\n')}`,
      },
    ],
    proveedor: t.proveedor,
    modelo: t.modelo,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    jsonMode: false,
  });
  return { resumen: r.content, model: r.model };
}
