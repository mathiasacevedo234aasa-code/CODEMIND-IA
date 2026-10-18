import { HttpError } from './store.js';
import { completar, completarStream, listarModelos, probarConexion, resolverModelo } from './proveedores.js';

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
].join('\n');

/**
 * El idioma de la respuesta. Las instrucciones siguen en espanol (el modelo
 * las entiende igual), pero lo que lee el usuario sale en el idioma que
 * eligio. Los NOMBRES de los campos del JSON no cambian: los lee la
 * aplicacion, no la persona.
 */
const reglasBase = (idioma) => `${BASE_RULES}\n${idioma === 'en'
  ? 'Answer in English. When a JSON format is required, keep its field names exactly as specified but write every value in English.'
  : 'Responde en espanol.'}`;

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

/**
 * Tipos de elemento que reciben argumentos y devuelven algo. Solo en estos
 * tiene sentido exigir parametros y valor de retorno: pedirselos a una regla
 * CSS o a una seccion de HTML obligaria al modelo a inventar.
 */
const INVOCABLES = new Set([
  'funcion', 'funcion flecha', 'expresion de funcion', 'metodo de clase', 'metodo de objeto',
  'componente React', 'hook personalizado', 'funcion exportada por defecto', 'manejador en linea',
  'constructor de clase',
]);

/** Que se le pide al modelo segun lo que esta mirando. */
const GUIA_POR_TIPO = {
  codigo: 'Es codigo ejecutable. Explica su logica paso a paso.',
  estructura:
    'Es un elemento de la estructura de una pagina HTML. Explica que papel cumple dentro de la pagina, que contiene, con que se relaciona (sus clases, su id, los estilos o scripts que lo usan) y que veria el usuario final. En "flujo" describe su composicion de fuera hacia dentro, no una ejecucion.',
  estilo:
    'Es una regla de estilo CSS. Explica a que elementos afecta el selector, que consigue visualmente cada propiedad y en que situaciones se aplica. En "flujo" describe el efecto de las propiedades por orden de importancia, no una ejecucion.',
  contenido:
    'Es una seccion de un documento. Explica de que trata, que informacion aporta y a quien va dirigida. En "flujo" resume su contenido por partes.',
};

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

/**
 * Tono y profundidad segun a quien va dirigida la explicacion. Solo cambia
 * COMO se cuenta: los hechos y las incertidumbres siguen siendo los mismos.
 */
/**
 * Estilos de documentacion. Igual que el nivel, cambian la FORMA y no los
 * hechos: un estilo breve no puede inventarse nada para llenar menos, y uno
 * formal no puede afirmar lo que el codigo no demuestra.
 */
export const ESTILOS = {
  normal: '',
  breve:
    'Estilo BREVE: cada campo en una o dos frases. "explicacion" en un solo parrafo corto. "flujo" con tres pasos como mucho. Sin rodeos ni introducciones.',
  didactico:
    'Estilo DIDACTICO, para estudiantes: explica el porque de cada paso, usa una comparacion cotidiana en "explicacion" y un ejemplo comentado linea a linea en "ejemplo". Define cada termino tecnico la primera vez que aparece.',
  jsdoc:
    'Estilo FORMAL tipo JSDoc: tono de documentacion de referencia, frases impersonales y precisas. En "ejemplo" usa el formato de un bloque de comentario JSDoc o docstring del lenguaje del codigo, con @param y @returns cuando aplique.',
};

export const NIVELES = {
  principiante:
    'Escribes para alguien que esta aprendiendo a programar. Evita la jerga; cuando un termino tecnico sea inevitable, explicalo en la misma frase. Usa comparaciones sencillas. Prefiere frases cortas. No des por sabido nada.',
  intermedio:
    'Escribes para alguien que ya programa pero no conoce este codigo. Puedes usar terminologia habitual sin explicarla, y centrarte en el porque de las decisiones.',
  avanzado:
    'Escribes para alguien con experiencia. Ve al grano, usa la terminologia precisa y detente en los detalles que solo se aprecian con oficio: casos limite, complejidad, efectos secundarios y supuestos implicitos.',
};

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
export function validateDoc(value, kind = 'funcion') {
  const problems = [];
  if (!value || typeof value !== 'object') return { ok: false, problems: ['La respuesta no es un objeto JSON.'] };
  const invocable = INVOCABLES.has(kind);

  for (const field of REQUIRED_FIELDS) {
    if (!(field in value)) problems.push(`Falta el campo "${field}".`);
  }
  for (const field of ['nombre', 'proposito', 'explicacion', 'ejemplo']) {
    if (field in value && (typeof value[field] !== 'string' || !value[field].trim())) {
      problems.push(`El campo "${field}" esta vacio o no es texto.`);
    }
  }
  if ('parametros' in value && !Array.isArray(value.parametros)) problems.push('"parametros" debe ser una lista.');
  // A un elemento que no se invoca no se le exige que declare parametros.
  if (!invocable && Array.isArray(value.parametros) && value.parametros.length > 0) {
    value.parametros = [];
  }
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
  if (context.kind) lines.push(`Tipo de elemento: ${context.kind}`);
  if (context.detail) lines.push(`Detalle del analizador: ${context.detail}`);
  if (context.lineStart) lines.push(`Linea de inicio: ${context.lineStart}`);
  if (context.relatedFunctions?.length) lines.push(`Otros elementos del mismo archivo: ${context.relatedFunctions.slice(0, 40).join(', ')}`);
  if (context.imports?.length) lines.push(`Importaciones del archivo: ${context.imports.join(', ')}`);
  if (context.classes?.length) lines.push(`Clases del archivo: ${context.classes.join(', ')}`);
  if (context.previousDoc) lines.push(`Documentacion aprobada anterior (referencia, puede estar desactualizada):\n${context.previousDoc}`);
  if (context.glosario) lines.push(context.glosario);
  if (context.preferencias) lines.push(context.preferencias);
  return lines.join('\n');
}

export async function generateFunctionDoc({ code, context, model, proveedor, temperature, maxTokens, extraInstruction }) {
  if (!code || !code.trim()) throw new HttpError(400, 'No se recibio el codigo que hay que explicar.');

  // Lo que se documenta ya no es siempre una funcion: puede ser una regla CSS,
  // una seccion de una pagina o un encabezado. Lo que se le pide al modelo
  // cambia segun el caso, y a lo que no se invoca no se le exigen parametros.
  const kind = context?.kind ?? 'funcion';
  const category = context?.category ?? 'codigo';
  const invocable = INVOCABLES.has(kind);

  const nivel = context?.level ?? 'intermedio';
  const estilo = ESTILOS[context?.estilo] ?? '';
  const guia = [
    NIVELES[nivel] ?? NIVELES.intermedio,
    estilo,
    `Lo que vas a explicar es de tipo "${kind}". ${GUIA_POR_TIPO[category] ?? GUIA_POR_TIPO.codigo}`,
    invocable
      ? 'Rellena "parametros" y "retorno" con lo que de verdad recibe y devuelve.'
      : 'Este elemento NO recibe parametros ni devuelve nada: deja "parametros" como lista vacia y en "retorno" pon descripcion "No aplica a este tipo de elemento", tipo null y certeza "confirmado". No inventes argumentos.',
  ].join(' ');

  const messages = [
    { role: 'system', content: `${reglasBase(context?.idioma)}\n\n${MODE_RULES.documentation}\n\n${guia}\n\n${DOC_SCHEMA_HINT}` },
    {
      role: 'user',
      content: [
        'Contexto disponible:',
        buildContextBlock(context) || '(sin contexto adicional)',
        '',
        `Elemento a documentar (tipo: ${kind}):`,
        '```',
        code,
        '```',
        context?.surrounding ? `\nFragmento del archivo alrededor (solo como referencia):\n\`\`\`\n${context.surrounding}\n\`\`\`` : '',
        extraInstruction ? `\nIndicacion adicional del usuario para esta regeneracion: ${extraInstruction}` : '',
        '',
        'Genera la propuesta de documentacion en el JSON indicado. No corrijas ni reescribas el codigo.',
      ].join('\n'),
    },
  ];

  const result = await completar({ messages, proveedor, modelo: model, temperature, maxTokens, jsonMode: true });
  const parsed = extractJson(result.content);
  const validation = validateDoc(parsed, kind);

  return {
    ok: validation.ok,
    problems: validation.problems,
    doc: parsed,
    model: result.model,
    proveedor: result.proveedor,
    usage: result.usage,
    rawLength: result.content.length,
  };
}

/** Los mensajes de una consulta al asistente, iguales con o sin streaming. */
function mensajesDeChat({ mode = 'comprehension', question, contextText, idioma, historial = [] }) {
  if (!question || !question.trim()) throw new HttpError(400, 'La pregunta esta vacia.');
  const modeRule = MODE_RULES[mode] || MODE_RULES.comprehension;
  // Los ultimos turnos de la conversacion, para que "y eso por que?" tenga
  // sentido. Pocos y recortados: el material del proyecto pesa mas.
  const previos = (Array.isArray(historial) ? historial : [])
    .filter((m) => m && (m.who === 'user' || m.who === 'ai') && typeof m.text === 'string' && m.text.trim())
    .slice(-8)
    .map((m) => ({ role: m.who === 'user' ? 'user' : 'assistant', content: m.text.slice(0, 4000) }));
  return [
    { role: 'system', content: `${reglasBase(idioma)}\n\n${modeRule}` },
    ...previos,
    {
      role: 'user',
      content: [
        contextText ? `Material disponible del proyecto:\n${contextText}` : '(sin material del proyecto)',
        '',
        `Pregunta: ${question}`,
      ].join('\n'),
    },
  ];
}

export async function chat({ mode, question, contextText, idioma, historial, model, proveedor, temperature, maxTokens }) {
  const messages = mensajesDeChat({ mode, question, contextText, idioma, historial });
  const result = await completar({ messages, proveedor, modelo: model, temperature, maxTokens, jsonMode: false });
  return { answer: result.content, model: result.model, proveedor: result.proveedor, usage: result.usage };
}

/** Lo mismo, pero entregando el texto a trozos segun llega. */
export async function chatStream({ mode, question, contextText, idioma, historial, model, proveedor, temperature, maxTokens }, alTrozo, opciones) {
  const messages = mensajesDeChat({ mode, question, contextText, idioma, historial });
  const result = await completarStream({ messages, proveedor, modelo: model, temperature, maxTokens }, alTrozo, opciones);
  return { answer: result.content, model: result.model, proveedor: result.proveedor };
}

/**
 * Comprueba de verdad si el proveedor configurado responde.
 *
 * Existe porque saber que "hay una clave" no sirve de nada: la aplicacion
 * decia "configurado" mientras usaba una clave caducada del entorno del
 * sistema, y el fallo solo aparecia al intentar documentar una funcion.
 */
export const testConnection = (proveedor) => probarConexion(proveedor);

export const listModels = (proveedor) => listarModelos(proveedor);

/** El modelo que se usaria ahora mismo, sin llamar a nadie. */
export const resolveModel = (proveedor, pedido) => resolverModelo(proveedor, pedido);

/**
 * Traduce una documentacion ya aprobada a otro idioma, para la version
 * bilingue. Mismas claves, mismos datos: solo cambia el idioma del texto.
 * Los nombres de codigo (funciones, parametros, tipos) no se traducen.
 */
export async function traducirDoc({ doc, idioma, model, temperature, maxTokens }) {
  if (!doc || typeof doc !== 'object') throw new HttpError(400, 'No hay documentacion que traducir.');
  const destino = idioma === 'en' ? 'ingles' : 'espanol';
  const messages = [
    {
      role: 'system',
      content: [
        `Eres un traductor tecnico. Traduce al ${destino} los TEXTOS del JSON que recibes.`,
        'Devuelve solo el JSON, con exactamente las mismas claves y la misma estructura.',
        'No traduzcas nombres de codigo: funciones, variables, parametros, tipos, rutas ni fragmentos de codigo de "ejemplo".',
        'No anadas ni quites informacion: es una traduccion, no una reescritura.',
      ].join(' '),
    },
    { role: 'user', content: JSON.stringify(doc) },
  ];
  const result = await completar({ messages, modelo: model, temperature: Math.min(temperature ?? 0.2, 0.3), maxTokens, jsonMode: true });
  const traducido = extractJson(result.content);
  if (!traducido || typeof traducido !== 'object') throw new HttpError(502, 'La traduccion no vino en el formato esperado. Puedes volver a intentarlo.');
  // Las claves que no vinieran se dejan como estaban: nunca se pierde un campo.
  const faltan = Object.keys(doc).filter((k) => !(k in traducido));
  for (const k of faltan) traducido[k] = doc[k];
  return { doc: traducido, model: result.model, faltan };
}

/**
 * La IA revisa una documentacion ya escrita frente al codigo actual. Solo
 * observa: dice que parece incorrecto, impreciso o que falta. No reescribe
 * nada; si el usuario quiere otra version, la pide aparte y pasa por Revision.
 */
export async function revisarDoc({ code, doc, idioma, model, temperature, maxTokens }) {
  if (!code || !doc) throw new HttpError(400, 'Faltan el codigo o la documentacion.');
  const messages = [
    {
      role: 'system',
      content: `${reglasBase(idioma)}\n\nModo Revision de documentacion: comparas una documentacion con el codigo real y senalas problemas. ` +
        'Responde SOLO con JSON: {"observaciones":[{"campo":"<nombre del campo>","tipo":"incorrecto"|"impreciso"|"falta"|"vago","detalle":"<una frase>"}],"veredicto":"<una frase>"}. ' +
        'Si esta bien, devuelve observaciones vacias. No propongas el texto corregido.',
    },
    { role: 'user', content: `Codigo:\n\`\`\`\n${String(code).slice(0, 8000)}\n\`\`\`\n\nDocumentacion:\n${JSON.stringify(doc).slice(0, 8000)}` },
  ];
  const result = await completar({ messages, modelo: model, temperature: Math.min(temperature ?? 0.2, 0.3), maxTokens, jsonMode: true });
  const r = extractJson(result.content);
  if (!r || !Array.isArray(r.observaciones)) throw new HttpError(502, 'La revision no vino en el formato esperado. Vuelve a intentarlo.');
  return { observaciones: r.observaciones.slice(0, 20), veredicto: String(r.veredicto ?? ''), model: result.model };
}
