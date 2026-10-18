import crypto from 'node:crypto';
import path from 'node:path';
import { PROJECTS_DIR } from '../env.js';
import { HttpError, readJson, writeJson, getProject, readDocs, readMemory } from './store.js';
import { completar } from './proveedores.js';

/**
 * Glosario del proyecto.
 *
 * Todo proyecto acaba teniendo palabras propias: "carrito", "reserva",
 * "pedido en firme", "SKU". Quien lleva meses dentro las da por sabidas y
 * quien llega no entiende nada; peor aun, a veces la misma palabra significa
 * dos cosas distintas en dos partes del codigo. Esto recoge esos terminos con
 * su significado y con donde aparecen.
 *
 * La IA propone; el usuario aprueba. Ni un termino entra en el glosario sin
 * que una persona lo haya leido y dicho que si, igual que con la
 * documentacion. Y cada termino guarda en que archivos se vio, para que nadie
 * tenga que fiarse de la palabra de un modelo.
 */

const archivo = (id) => path.join(PROJECTS_DIR, id, 'glosario.json');

export const GLOSARIO_VACIO = { terminos: [], propuestas: [], updatedAt: null };

const leer = (id) => readJson(archivo(id), GLOSARIO_VACIO);

async function guardar(id, valor) {
  const siguiente = { ...valor, updatedAt: new Date().toISOString() };
  await writeJson(archivo(id), siguiente);
  return siguiente;
}

export async function obtener(projectId) {
  await getProject(projectId);
  return leer(projectId);
}

// ----------------------------------------------------------- terminos

const limpiar = (texto, maximo) =>
  typeof texto === 'string' ? texto.trim().slice(0, maximo) : '';

function validarTermino(entrada) {
  const termino = limpiar(entrada?.termino, 120);
  const definicion = limpiar(entrada?.definicion, 2000);
  if (!termino) throw new HttpError(400, 'El termino no puede estar vacio.');
  if (!definicion) throw new HttpError(400, `Falta la definicion de "${termino}".`);
  return {
    termino,
    definicion,
    // De donde sale: lo que hace que el glosario sea comprobable y no un
    // conjunto de afirmaciones sueltas.
    apariciones: Array.isArray(entrada?.apariciones)
      ? entrada.apariciones.map((a) => limpiar(a, 300)).filter(Boolean).slice(0, 30)
      : [],
    notas: limpiar(entrada?.notas, 1000),
    aliases: Array.isArray(entrada?.aliases)
      ? entrada.aliases.map((a) => limpiar(a, 120)).filter(Boolean).slice(0, 10)
      : [],
  };
}

export async function anadirTermino(projectId, entrada, origen = 'persona') {
  const glosario = await obtener(projectId);
  const limpio = validarTermino(entrada);

  const repetido = glosario.terminos.find(
    (t) => t.termino.toLowerCase() === limpio.termino.toLowerCase(),
  );
  if (repetido) {
    throw new HttpError(409, `"${limpio.termino}" ya esta en el glosario. Editalo en lugar de anadirlo otra vez.`);
  }

  const termino = {
    id: crypto.randomUUID(),
    ...limpio,
    origen, // 'persona' | 'propuesta-aprobada'
    creado: new Date().toISOString(),
    actualizado: new Date().toISOString(),
  };
  return guardar(projectId, { ...glosario, terminos: [...glosario.terminos, termino] });
}

export async function editarTermino(projectId, terminoId, entrada) {
  const glosario = await obtener(projectId);
  const actual = glosario.terminos.find((t) => t.id === terminoId);
  if (!actual) throw new HttpError(404, 'Ese termino ya no esta en el glosario.');
  const limpio = validarTermino({ ...actual, ...entrada });

  return guardar(projectId, {
    ...glosario,
    terminos: glosario.terminos.map((t) =>
      t.id === terminoId ? { ...t, ...limpio, origen: 'persona', actualizado: new Date().toISOString() } : t,
    ),
  });
}

export async function borrarTermino(projectId, terminoId) {
  const glosario = await obtener(projectId);
  if (!glosario.terminos.some((t) => t.id === terminoId)) {
    throw new HttpError(404, 'Ese termino ya no esta en el glosario.');
  }
  return guardar(projectId, {
    ...glosario,
    terminos: glosario.terminos.filter((t) => t.id !== terminoId),
  });
}

// ---------------------------------------------------------- propuestas

export async function aprobarPropuesta(projectId, propuestaId) {
  const glosario = await obtener(projectId);
  const propuesta = glosario.propuestas.find((p) => p.id === propuestaId);
  if (!propuesta) throw new HttpError(404, 'Esa propuesta ya no existe.');

  const sinElla = { ...glosario, propuestas: glosario.propuestas.filter((p) => p.id !== propuestaId) };
  await guardar(projectId, sinElla);
  return anadirTermino(projectId, propuesta, 'propuesta-aprobada');
}

export async function descartarPropuesta(projectId, propuestaId) {
  const glosario = await obtener(projectId);
  if (!glosario.propuestas.some((p) => p.id === propuestaId)) {
    throw new HttpError(404, 'Esa propuesta ya no existe.');
  }
  return guardar(projectId, {
    ...glosario,
    propuestas: glosario.propuestas.filter((p) => p.id !== propuestaId),
  });
}

// ------------------------------------------------------- las propuestas

const REGLAS = [
  'Eres el asistente de CodeMind AI. Tu unica funcion es EXPLICAR y DOCUMENTAR.',
  'Estas elaborando el glosario de un proyecto: los terminos PROPIOS de su dominio.',
  'Incluye solo palabras que signifiquen algo concreto DENTRO de este proyecto: entidades del negocio, conceptos propios, nombres recurrentes en el codigo.',
  'NO incluyas terminos generales de programacion (funcion, clase, variable, API, componente, base de datos) salvo que en este proyecto tengan un significado particular; en ese caso, explica cual.',
  'Cada definicion debe poder deducirse del material recibido. No inventes reglas de negocio que no aparezcan.',
  'En "apariciones" pon las rutas de archivo del material donde se ve ese termino, tal cual aparecen.',
  'Si un termino se usa con dos significados distintos, dilo explicitamente en "notas": eso es justo lo que mas ayuda.',
  'Responde en espanol.',
].join('\n');

const ESQUEMA = `Devuelve EXCLUSIVAMENTE un objeto JSON valido con esta forma:
{
  "terminos": [
    {
      "termino": "string",
      "definicion": "string, dos o tres frases",
      "aliases": ["string"],
      "apariciones": ["ruta/al/archivo.ext"],
      "notas": "string, vacio si no hay nada que anadir"
    }
  ]
}
Sin texto antes ni despues del JSON. Sin bloques de codigo markdown. Como mucho 15 terminos, los mas utiles.`;

function extraerJson(texto) {
  const limpio = texto.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(limpio);
  } catch {
    const a = limpio.indexOf('{');
    const b = limpio.lastIndexOf('}');
    if (a === -1 || b <= a) return null;
    try {
      return JSON.parse(limpio.slice(a, b + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Pide a la IA candidatos a termino. NO los guarda en el glosario: quedan
 * como propuestas a la espera de que alguien las lea.
 *
 * El material que se envia son los nombres de los elementos detectados y la
 * documentacion ya aprobada, no el codigo entero: basta para reconocer el
 * vocabulario y es muchisimo menos de lo que sale del equipo.
 */
export async function proponer(projectId, { elementos = [], temperature, maxTokens, proveedor, modelo } = {}) {
  const proyecto = await getProject(projectId);
  const glosario = await obtener(projectId);
  const memoria = await readMemory(projectId);
  const docs = await readDocs(projectId);

  if (!elementos.length) {
    throw new HttpError(400, 'No hay ningun elemento analizado del que sacar vocabulario. Abre el proyecto y deja que termine el analisis.');
  }

  const yaEstan = new Set(
    glosario.terminos.map((t) => t.termino.toLowerCase())
      .concat(glosario.propuestas.map((p) => p.termino.toLowerCase())),
  );

  const inventario = elementos
    .slice(0, 400)
    .map((e) => `- ${e.nombre} (${e.tipo}) en ${e.archivo}`)
    .join('\n');

  const documentado = Object.values(docs.approved ?? {})
    .slice(0, 80)
    .map((v) => `- ${v.name}: ${v.doc?.proposito ?? ''}`)
    .join('\n');

  const material = [
    `Proyecto: ${proyecto.name}`,
    `Objetivo declarado: ${proyecto.objective || '(no registrado)'}`,
    '',
    'Memoria del proyecto:',
    JSON.stringify(memoria?.overview ?? {}, null, 2).slice(0, 2500),
    '',
    'Elementos detectados en el codigo (nombre, tipo y archivo):',
    inventario,
    '',
    documentado ? `Documentacion ya aprobada:\n${documentado}` : '(todavia no hay documentacion aprobada)',
    '',
    yaEstan.size
      ? `Ya estan recogidos, NO los repitas: ${[...yaEstan].join(', ')}`
      : 'El glosario esta vacio.',
  ].join('\n');

  const resultado = await completar({
    messages: [
      { role: 'system', content: `${REGLAS}\n\n${ESQUEMA}` },
      { role: 'user', content: material },
    ],
    proveedor,
    modelo,
    temperature,
    maxTokens,
    jsonMode: true,
  });

  const parsed = extraerJson(resultado.content);
  const crudos = Array.isArray(parsed?.terminos) ? parsed.terminos : [];
  if (!crudos.length) {
    throw new HttpError(502, 'El modelo no devolvio ningun termino en el formato esperado.');
  }

  // Se filtra lo que ya existe y lo que no trae definicion: una propuesta a
  // medias solo le hace perder el tiempo a quien la revisa.
  const nuevas = [];
  for (const crudo of crudos) {
    const termino = limpiar(crudo?.termino, 120);
    const definicion = limpiar(crudo?.definicion, 2000);
    if (!termino || !definicion) continue;
    if (yaEstan.has(termino.toLowerCase())) continue;
    yaEstan.add(termino.toLowerCase());
    nuevas.push({
      id: crypto.randomUUID(),
      termino,
      definicion,
      aliases: Array.isArray(crudo?.aliases) ? crudo.aliases.map((a) => limpiar(a, 120)).filter(Boolean).slice(0, 10) : [],
      apariciones: Array.isArray(crudo?.apariciones) ? crudo.apariciones.map((a) => limpiar(a, 300)).filter(Boolean).slice(0, 30) : [],
      notas: limpiar(crudo?.notas, 1000),
      propuesto: new Date().toISOString(),
      modelo: resultado.model,
      proveedor: resultado.proveedor,
    });
  }

  const guardado = await guardar(projectId, {
    ...glosario,
    propuestas: [...glosario.propuestas, ...nuevas],
  });

  return {
    glosario: guardado,
    nuevas: nuevas.length,
    descartadas: crudos.length - nuevas.length,
    modelo: resultado.model,
    proveedor: resultado.proveedor,
  };
}

/** El glosario aprobado en texto, para dárselo al asistente como contexto. */
export async function comoTexto(projectId) {
  const glosario = await leer(projectId);
  if (!glosario.terminos.length) return '';
  return [
    'Glosario del proyecto (aprobado por el usuario, tratalo como cierto):',
    ...glosario.terminos.map((t) => `- ${t.termino}: ${t.definicion}${t.notas ? ` (${t.notas})` : ''}`),
  ].join('\n');
}

// ------------------------------------------------- coherencia y reutilizar

/** Sin mayúsculas ni tildes: "Pedido en firme" y "pedido en FIRME" son lo mismo. */
const normal = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Términos inconsistentes: la documentación aprobada usa un sinónimo (alias)
 * donde el glosario fija otra palabra, o el glosario tiene dos términos que
 * son el mismo escrito distinto. Solo se señala; no se cambia nada.
 */
export async function inconsistencias(projectId) {
  const glosario = await obtener(projectId);
  const docs = await readDocs(projectId);
  const resultado = [];

  const vistos = new Map();
  for (const t of glosario.terminos) {
    const n = normal(t.termino);
    if (vistos.has(n)) resultado.push({ tipo: 'duplicado', termino: t.termino, otro: vistos.get(n) });
    else vistos.set(n, t.termino);
  }

  for (const t of glosario.terminos) {
    for (const alias of t.aliases ?? []) {
      const escapado = normal(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patron = new RegExp(`(^|[^\\p{L}])${escapado}($|[^\\p{L}])`, 'u');
      for (const entrada of Object.values(docs.approved)) {
        for (const [campo, valor] of Object.entries(entrada.doc ?? {})) {
          if (typeof valor === 'string' && patron.test(normal(valor))) {
            resultado.push({ tipo: 'sinonimo', termino: t.termino, alias, elemento: entrada.name, functionId: entrada.functionId, campo });
          }
        }
      }
    }
  }
  return resultado;
}

/** Trae a este proyecto los términos de otro que aquí no estén. Nunca pisa ninguno. */
export async function importarDe(projectId, desdeId) {
  if (projectId === desdeId) throw new HttpError(400, 'Elige otro proyecto.');
  await getProject(desdeId);
  const origen = await obtener(desdeId);
  const destino = await obtener(projectId);
  const yaEstan = new Set(destino.terminos.map((t) => normal(t.termino)));
  const nuevos = origen.terminos
    .filter((t) => !yaEstan.has(normal(t.termino)))
    .map((t) => ({
      ...t,
      id: crypto.randomUUID(),
      // Las apariciones eran rutas del OTRO proyecto: aquí no significan nada.
      apariciones: [],
      origen: 'importado',
      creado: new Date().toISOString(),
      actualizado: new Date().toISOString(),
    }));
  await guardar(projectId, { ...destino, terminos: [...destino.terminos, ...nuevos] });
  return { importados: nuevos.length, omitidos: origen.terminos.length - nuevos.length };
}
