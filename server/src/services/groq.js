import { DEFAULT_MODEL, GROQ_BASE_URL } from '../env.js';
import { HttpError, getApiKey, readSettings } from './store.js';

/**
 * Reglas de comportamiento que comparten todos los modos del asistente.
 * La aplicacion nunca modifica codigo: la IA explica, el usuario decide.
 */
const BASE_RULES = [
  'Eres el asistente de CodeMind AI. Tu unica funcion es EXPLICAR y DOCUMENTAR codigo.',
  'Prohibido: corregir, reescribir, refactorizar, renombrar, optimizar, anadir o eliminar codigo.',
  'Prohibido proponer parches o versiones "mejoradas" del codigo salvo que se te pregunte explicitamente por el comportamiento de una instruccion concreta, y aun entonces solo se describe, no se corrige.',
  'Describe unicamente el comportamiento que se puede deducir del codigo proporcionado.',
  'Distingue siempre entre lo que el codigo demuestra y lo que solo es una inferencia probable.',
  'Si te falta informacion para afirmar algo, dilo de forma explicita en lugar de inventarlo.',
  'No inventes servicios, parametros, decisiones de diseno ni dependencias que no aparezcan en el material recibido.',
  'Responde en espanol.',
].join('\n');

const MODE_RULES = {
  documentation:
    'Modo Documentacion: generas una propuesta de documentacion tecnica y conceptual de una funcion concreta.',
  comprehension:
    'Modo Comprension: respondes preguntas sobre el codigo que se te muestra, sin modificarlo.',
  context:
    'Modo Contexto del proyecto: respondes sobre objetivo, arquitectura, funcionalidades, decisiones y progreso, usando solo la memoria y los datos del proyecto. Si algo no esta registrado, di que no consta.',
  technical:
    'Modo Consulta tecnica: respondes preguntas generales sobre HTML, CSS, JavaScript, TypeScript y tecnologias web. Puedes mostrar ejemplos didacticos genericos, pero nunca reescribes el codigo del usuario.',
};

/** Campos minimos obligatorios de una propuesta de documentacion. */
const REQUIRED_FIELDS = [
  'nombre',
  'proposito',
  'explicacion',
  'parametros',
  'retorno',
  'flujo',
  'dependencias',
  'ejemplo',
  'observaciones',
];

const DOC_SCHEMA_HINT = `Devuelve EXCLUSIVAMENTE un objeto JSON valido con esta forma exacta:
{
  "nombre": "string",
  "proposito": "string",
  "explicacion": "string",
  "parametros": [
    { "nombre": "string", "tipo": "string | null", "descripcion": "string", "certeza": "confirmado" | "inferido" }
  ],
  "retorno": { "descripcion": "string", "tipo": "string | null", "certeza": "confirmado" | "inferido" },
  "flujo": ["string"],
  "dependencias": [
    { "nombre": "string", "clase": "funcion" | "variable" | "clase" | "modulo" | "servicio" | "desconocido", "certeza": "confirmado" | "inferido" }
  ],
  "ejemplo": "string con un ejemplo de uso coherente con el codigo",
  "observaciones": "string",
  "incertidumbres": ["string"]
}
Sin texto antes ni despues del JSON. Sin bloques de codigo markdown.`;

export async function resolveModel(requested) {
  if (requested && String(requested).trim()) return String(requested).trim();
  const settings = await readSettings();
  return settings.model || DEFAULT_MODEL;
}

/** Una sola peticion HTTP a Groq. Devuelve el estado sin interpretarlo. */
async function postCompletion({ key, model, messages, temperature, maxTokens, jsonMode }) {
  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    // Los modelos de razonamiento (gpt-oss) consumen parte del presupuesto de
    // tokens pensando. Con esfuerzo bajo queda margen para la respuesta.
    ...(/gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {}),
  };
  try {
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    return { res, raw: await res.text() };
  } catch (err) {
    // El mensaje de red nunca debe incluir la clave.
    throw new HttpError(502, `No se pudo contactar con Groq: ${err.message}`);
  }
}

function describeError(status, raw, model, source) {
  let detail = raw.slice(0, 600);
  let code = null;
  try {
    const parsed = JSON.parse(raw);
    detail = parsed?.error?.message || detail;
    code = parsed?.error?.code ?? null;
  } catch {
    /* respuesta no JSON */
  }
  if (status === 401) {
    // Decir de DONDE salio la clave es la diferencia entre resolverlo en un
    // minuto y no entender nada: una variable de sistema antigua puede estar
    // tapando la buena, y en la aplicacion instalada no hay ningun .env.
    const origen = {
      guardada: 'Es la clave que guardaste desde Configuracion.',
      'archivo .env': 'Es la clave del archivo .env del proyecto.',
      'variable del sistema':
        'Esa clave NO es de la aplicacion: viene de la variable de entorno GROQ_API_KEY de tu equipo. Guarda tu clave desde Configuracion y tendra prioridad sobre ella.',
    }[source] ?? '';
    return {
      code,
      error: new HttpError(401, `Groq rechazo la API key. ${origen} Comprueba que sigue activa en console.groq.com.`),
    };
  }
  if (status === 404) {
    return {
      code,
      error: new HttpError(404, `Groq no reconoce el modelo "${model}" o tu cuenta no tiene acceso a el. Elige otro identificador en Configuracion. Detalle: ${detail}`),
    };
  }
  if (status === 429) return { code, error: new HttpError(429, `Groq aplico un limite de uso (429). ${detail}`) };
  if (status === 413 || /max_tokens|context/i.test(detail)) {
    return { code, error: new HttpError(400, `La peticion excede los limites del modelo. ${detail}`) };
  }
  return { code, error: new HttpError(502, `Groq devolvio un error ${status}: ${detail}`) };
}

/** Llamada a Groq (API compatible con OpenAI chat/completions). */
async function callGroq({ messages, model, temperature, maxTokens, jsonMode }) {
  const { key, source } = await getApiKey();
  if (!key) {
    throw new HttpError(
      400,
      'No hay una API key de Groq configurada. Guardala desde Configuracion o anade GROQ_API_KEY al archivo .env.',
    );
  }

  let { res, raw } = await postCompletion({ key, model, messages, temperature, maxTokens, jsonMode });

  if (!res.ok) {
    const { code, error } = describeError(res.status, raw, model, source);
    // Algunos modelos fallan la validacion estricta de JSON del propio Groq.
    // Reintentamos en modo texto y validamos nosotros la estructura.
    if (jsonMode && code === 'json_validate_failed') {
      ({ res, raw } = await postCompletion({ key, model, messages, temperature, maxTokens, jsonMode: false }));
      if (!res.ok) throw describeError(res.status, raw, model, source).error;
    } else {
      throw error;
    }
  }

  const data = JSON.parse(raw);
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    const reason = data?.choices?.[0]?.finish_reason;
    throw new HttpError(
      502,
      reason === 'length'
        ? 'Groq agoto el limite de tokens antes de terminar la respuesta. Aumenta "Tokens maximos" en Configuracion.'
        : 'Groq devolvio una respuesta sin contenido utilizable.',
    );
  }
  return { content, usage: data.usage ?? null, model: data.model ?? model };
}

/** Extrae el primer objeto JSON de un texto, por si el modelo anade adornos. */
function extractJson(text) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* seguimos intentando */
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Valida la propuesta. Una respuesta incompleta nunca se guarda como documentacion. */
export function validateDoc(value) {
  const problems = [];
  if (!value || typeof value !== 'object') return { ok: false, problems: ['La respuesta no es un objeto JSON.'] };

  for (const field of REQUIRED_FIELDS) {
    if (!(field in value)) problems.push(`Falta el campo "${field}".`);
  }
  for (const field of ['nombre', 'proposito', 'explicacion', 'ejemplo']) {
    if (field in value && (typeof value[field] !== 'string' || !value[field].trim())) {
      problems.push(`El campo "${field}" esta vacio o no es texto.`);
    }
  }
  if ('parametros' in value && !Array.isArray(value.parametros)) problems.push('"parametros" debe ser una lista.');
  if ('flujo' in value && !Array.isArray(value.flujo)) problems.push('"flujo" debe ser una lista de pasos.');
  if ('dependencias' in value && !Array.isArray(value.dependencias)) problems.push('"dependencias" debe ser una lista.');
  if ('retorno' in value && (typeof value.retorno !== 'object' || value.retorno === null)) {
    problems.push('"retorno" debe ser un objeto con descripcion y tipo.');
  }
  return { ok: problems.length === 0, problems };
}

function buildContextBlock(context = {}) {
  const lines = [];
  if (context.projectName) lines.push(`Proyecto: ${context.projectName}`);
  if (context.projectObjective) lines.push(`Objetivo del proyecto: ${context.projectObjective}`);
  if (context.filePath) lines.push(`Archivo: ${context.filePath}`);
  if (context.language) lines.push(`Lenguaje detectado: ${context.language}`);
  if (context.lineStart) lines.push(`Linea de inicio: ${context.lineStart}`);
  if (context.relatedFunctions?.length) lines.push(`Otras funciones del mismo archivo: ${context.relatedFunctions.join(', ')}`);
  if (context.imports?.length) lines.push(`Importaciones del archivo: ${context.imports.join(', ')}`);
  if (context.classes?.length) lines.push(`Clases del archivo: ${context.classes.join(', ')}`);
  if (context.previousDoc) lines.push(`Documentacion aprobada anterior (referencia, puede estar desactualizada):\n${context.previousDoc}`);
  return lines.join('\n');
}

export async function generateFunctionDoc({ code, context, model, temperature, maxTokens, extraInstruction }) {
  if (!code || !code.trim()) throw new HttpError(400, 'No se recibio el codigo de la funcion.');

  const messages = [
    { role: 'system', content: `${BASE_RULES}\n\n${MODE_RULES.documentation}\n\n${DOC_SCHEMA_HINT}` },
    {
      role: 'user',
      content: [
        'Contexto disponible:',
        buildContextBlock(context) || '(sin contexto adicional)',
        '',
        'Codigo de la funcion a documentar:',
        '```',
        code,
        '```',
        context?.surrounding ? `\nFragmento del archivo alrededor de la funcion (solo como referencia):\n\`\`\`\n${context.surrounding}\n\`\`\`` : '',
        extraInstruction ? `\nIndicacion adicional del usuario para esta regeneracion: ${extraInstruction}` : '',
        '',
        'Genera la propuesta de documentacion en el JSON indicado. No corrijas ni reescribas el codigo.',
      ].join('\n'),
    },
  ];

  const resolved = await resolveModel(model);
  const result = await callGroq({ messages, model: resolved, temperature, maxTokens, jsonMode: true });
  const parsed = extractJson(result.content);
  const validation = validateDoc(parsed);

  return {
    ok: validation.ok,
    problems: validation.problems,
    doc: parsed,
    model: result.model,
    usage: result.usage,
    rawLength: result.content.length,
  };
}

export async function chat({ mode = 'comprehension', question, contextText, model, temperature, maxTokens }) {
  if (!question || !question.trim()) throw new HttpError(400, 'La pregunta esta vacia.');
  const modeRule = MODE_RULES[mode] || MODE_RULES.comprehension;

  const messages = [
    { role: 'system', content: `${BASE_RULES}\n\n${modeRule}` },
    {
      role: 'user',
      content: [
        contextText ? `Material disponible del proyecto:\n${contextText}` : '(sin material del proyecto)',
        '',
        `Pregunta: ${question}`,
      ].join('\n'),
    },
  ];

  const resolved = await resolveModel(model);
  const result = await callGroq({ messages, model: resolved, temperature, maxTokens, jsonMode: false });
  return { answer: result.content, model: result.model, usage: result.usage };
}

/**
 * Comprueba de verdad si la clave configurada funciona.
 *
 * Existe porque saber que "hay una clave" no sirve de nada: la aplicacion
 * decia "Groq configurado" mientras usaba una clave caducada del entorno del
 * sistema, y el fallo solo aparecia al intentar documentar una funcion.
 */
export async function testConnection() {
  const { key, source } = await getApiKey();
  if (!key) return { ok: false, source: null, message: 'No hay ninguna API key configurada.' };

  let res;
  try {
    res = await fetch(`${GROQ_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return { ok: false, source, message: `No se pudo contactar con Groq: ${err.message}` };
  }

  if (!res.ok) {
    const { error } = describeError(res.status, await res.text(), await resolveModel(null), source);
    return { ok: false, source, message: error.message };
  }

  const data = await res.json();
  const model = await resolveModel(null);
  const disponibles = (data?.data ?? []).map((m) => m.id);
  const tieneModelo = disponibles.includes(model);

  return {
    ok: true,
    source,
    model,
    modelAvailable: tieneModelo,
    message: tieneModelo
      ? `Conexion correcta. El modelo "${model}" esta disponible en tu cuenta.`
      : `La clave funciona, pero tu cuenta no tiene acceso al modelo "${model}". Elige otro de la lista.`,
  };
}

export async function listModels() {
  const { key } = await getApiKey();
  if (!key) throw new HttpError(400, 'No hay una API key de Groq configurada.');
  const res = await fetch(`${GROQ_BASE_URL}/models`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new HttpError(502, `Groq devolvio ${res.status} al listar modelos.`);
  const data = await res.json();
  return (data?.data ?? []).map((m) => ({ id: m.id, owned_by: m.owned_by, context_window: m.context_window }));
}
