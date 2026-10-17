import { MODELO_GROQ_ENV } from '../env.js';
import { HttpError, getApiKey, readSettings } from './store.js';

/**
 * Proveedores de IA.
 *
 * CodeMind AI no esta casado con ningun servicio. Aqui vive lo unico que
 * cambia de uno a otro: la direccion, como se autentica, como se le pide una
 * respuesta y como se le pregunta que modelos tiene. Todo lo demas —las reglas
 * del asistente, el formato de la documentacion, la validacion— es igual para
 * todos y vive en ia.js.
 *
 * Hay dos protocolos, no cinco: casi todos hablan el mismo dialecto que
 * OpenAI, y Anthropic habla el suyo. Ollama entra por el dialecto de OpenAI,
 * que es el que expone, con la diferencia de que corre en el propio equipo y
 * no necesita ninguna clave.
 */

export const PROVEEDORES = {
  groq: {
    id: 'groq',
    nombre: 'Groq',
    protocolo: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    variableEntorno: 'GROQ_API_KEY',
    necesitaClave: true,
    local: false,
    modeloPorDefecto: 'openai/gpt-oss-120b',
    donde: 'console.groq.com/keys',
    nota: 'Muy rapido y con nivel gratuito. Es el proveedor con el que nacio la aplicacion.',
  },
  openai: {
    id: 'openai',
    nombre: 'OpenAI',
    protocolo: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    variableEntorno: 'OPENAI_API_KEY',
    necesitaClave: true,
    local: false,
    modeloPorDefecto: 'gpt-4o-mini',
    donde: 'platform.openai.com/api-keys',
    nota: 'De pago por uso.',
  },
  anthropic: {
    id: 'anthropic',
    nombre: 'Anthropic',
    protocolo: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    variableEntorno: 'ANTHROPIC_API_KEY',
    necesitaClave: true,
    local: false,
    modeloPorDefecto: 'claude-sonnet-4-5',
    donde: 'console.anthropic.com/settings/keys',
    nota: 'De pago por uso. Habla su propio protocolo, no el de OpenAI.',
  },
  openrouter: {
    id: 'openrouter',
    nombre: 'OpenRouter',
    protocolo: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    variableEntorno: 'OPENROUTER_API_KEY',
    necesitaClave: true,
    local: false,
    modeloPorDefecto: 'meta-llama/llama-3.3-70b-instruct',
    donde: 'openrouter.ai/keys',
    nota: 'Una sola clave para modelos de muchos proveedores distintos.',
  },
  ollama: {
    id: 'ollama',
    nombre: 'Ollama (en tu equipo)',
    protocolo: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    variableEntorno: null,
    necesitaClave: false,
    local: true,
    modeloPorDefecto: '',
    donde: 'ollama.com',
    nota: 'El modelo corre en tu propio equipo: tu codigo no sale de el y funciona sin conexion. Necesitas instalar Ollama y descargar un modelo con "ollama pull".',
  },
};

export const listaProveedores = () =>
  Object.values(PROVEEDORES).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    necesitaClave: p.necesitaClave,
    local: p.local,
    modeloPorDefecto: p.modeloPorDefecto,
    variableEntorno: p.variableEntorno,
    donde: p.donde,
    nota: p.nota,
  }));

export function descriptor(id) {
  const p = PROVEEDORES[id];
  if (!p) throw new HttpError(400, `"${id}" no es un proveedor de IA conocido.`);
  return p;
}

/**
 * El proveedor en uso, su direccion y su clave.
 *
 * La direccion de Ollama es configurable porque no todo el mundo lo tiene en
 * el puerto de siempre, y hay quien lo ejecuta en otra maquina de su red.
 */
export async function activo(idPedido) {
  const settings = await readSettings();
  const id = idPedido || settings.proveedor || 'groq';
  const p = descriptor(id);
  const baseUrl = p.local ? (settings.ollamaUrl || p.baseUrl) : p.baseUrl;
  const { key, source } = p.necesitaClave ? await getApiKey(id) : { key: null, source: null };
  return { proveedor: p, baseUrl: baseUrl.replace(/\/+$/, ''), key, source, settings };
}

/** El modelo a usar: el pedido, el guardado para ese proveedor, o el suyo. */
export async function resolverModelo(idProveedor, pedido) {
  if (pedido && String(pedido).trim()) return String(pedido).trim();
  const settings = await readSettings();
  const id = idProveedor || settings.proveedor || 'groq';
  const guardado = settings.modelos?.[id];
  if (guardado && String(guardado).trim()) return String(guardado).trim();
  // Compatibilidad: antes solo habia Groq y el modelo vivia suelto en los
  // ajustes o en GROQ_MODEL del .env. Se sigue respetando para Groq.
  if (id === 'groq') {
    if (settings.model && String(settings.model).trim()) return String(settings.model).trim();
    if (MODELO_GROQ_ENV) return MODELO_GROQ_ENV;
  }
  return descriptor(id).modeloPorDefecto;
}

// ------------------------------------------------------ errores legibles

/**
 * Quita la clave de cualquier texto antes de que llegue a una pantalla.
 *
 * Los mensajes de error salen de sitios que no controlamos —el cuerpo que
 * devuelve el servicio, el error de red de fetch— y acaban en la interfaz y
 * en el registro. Que una clave aparezca ahi seria filtrarla en el unico
 * sitio donde el usuario la va a copiar y pegar para pedir ayuda. No se
 * confia en que ninguna de esas fuentes se porte bien.
 */
function sinClave(texto, clave) {
  if (!texto || !clave || clave.length < 8) return texto;
  return texto.split(clave).join('***');
}

function detalleDe(raw) {
  try {
    const parsed = JSON.parse(raw);
    return {
      mensaje: parsed?.error?.message || parsed?.error || raw.slice(0, 600),
      codigo: parsed?.error?.code ?? parsed?.error?.type ?? null,
    };
  } catch {
    return { mensaje: raw.slice(0, 600), codigo: null };
  }
}

/** De donde salio la clave. Saberlo es la diferencia entre resolverlo o no. */
const ORIGEN = {
  guardada: 'Es la clave que guardaste desde Configuracion.',
  'archivo .env': 'Es la clave del archivo .env del proyecto.',
  'variable del sistema':
    'Esa clave NO es de la aplicacion: viene de una variable de entorno de tu equipo. Guarda tu clave desde Configuracion y tendra prioridad sobre ella.',
};

export function describirError(status, raw, { proveedor, modelo, source, clave }) {
  const { mensaje: crudo, codigo } = detalleDe(raw);
  const mensaje = sinClave(crudo, clave);
  const nombre = proveedor.nombre;

  if (status === 401 || status === 403) {
    return {
      codigo,
      error: new HttpError(401, `${nombre} rechazo la API key. ${ORIGEN[source] ?? ''} Comprueba que sigue activa en ${proveedor.donde}.`),
    };
  }
  if (status === 404) {
    return {
      codigo,
      error: new HttpError(404, proveedor.local
        ? `Ollama no tiene el modelo "${modelo}". Descargalo con "ollama pull ${modelo}" y vuelve a intentarlo. Detalle: ${mensaje}`
        : `${nombre} no reconoce el modelo "${modelo}" o tu cuenta no tiene acceso a el. Elige otro en Configuracion. Detalle: ${mensaje}`),
    };
  }
  if (status === 429) return { codigo, error: new HttpError(429, `${nombre} aplico un limite de uso (429). ${mensaje}`) };
  if (status === 413 || /max_tokens|context length|too long/i.test(mensaje)) {
    return { codigo, error: new HttpError(400, `La peticion excede los limites del modelo. ${mensaje}`) };
  }
  return { codigo, error: new HttpError(502, `${nombre} devolvio un error ${status}: ${mensaje}`) };
}

// ------------------------------------------------------------ peticiones

function cuerpoOpenai({ modelo, messages, temperature, maxTokens, jsonMode }) {
  return {
    model: modelo,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    // Los modelos de razonamiento (gpt-oss) consumen parte del presupuesto de
    // tokens pensando. Con esfuerzo bajo queda margen para la respuesta.
    ...(/gpt-oss/i.test(modelo) ? { reasoning_effort: 'low' } : {}),
  };
}

/** Anthropic separa el mensaje de sistema y no admite "response_format". */
function cuerpoAnthropic({ modelo, messages, temperature, maxTokens }) {
  const sistema = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  return {
    model: modelo,
    max_tokens: maxTokens,
    temperature,
    ...(sistema ? { system: sistema } : {}),
    messages: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content })),
  };
}

async function pedir({ proveedor, baseUrl, key, modelo, messages, temperature, maxTokens, jsonMode }) {
  const anthropic = proveedor.protocolo === 'anthropic';
  const url = `${baseUrl}${anthropic ? '/messages' : '/chat/completions'}`;
  const headers = { 'Content-Type': 'application/json' };
  if (key) {
    if (anthropic) {
      headers['x-api-key'] = key;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers.Authorization = `Bearer ${key}`;
    }
  }
  const body = anthropic
    ? cuerpoAnthropic({ modelo, messages, temperature, maxTokens })
    : cuerpoOpenai({ modelo, messages, temperature, maxTokens, jsonMode });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      // Un modelo local en un equipo modesto puede tardar bastante.
      signal: AbortSignal.timeout(proveedor.local ? 300000 : 120000),
    });
    return { res, raw: await res.text() };
  } catch (err) {
    // El mensaje de red nunca debe incluir la clave.
    const pista = proveedor.local
      ? ` Comprueba que Ollama esta funcionando: abre ${baseUrl.replace('/v1', '')} en el navegador o ejecuta "ollama serve".`
      : '';
    throw new HttpError(502, `No se pudo contactar con ${proveedor.nombre}: ${sinClave(err.message, key)}.${pista}`);
  }
}

/** Saca el texto de la respuesta, venga en el formato que venga. */
function contenidoDe(datos, protocolo) {
  if (protocolo === 'anthropic') {
    const bloques = Array.isArray(datos?.content) ? datos.content : [];
    return {
      texto: bloques.filter((b) => b.type === 'text').map((b) => b.text).join(''),
      motivo: datos?.stop_reason ?? null,
      modelo: datos?.model ?? null,
      uso: datos?.usage ?? null,
    };
  }
  return {
    texto: datos?.choices?.[0]?.message?.content ?? '',
    motivo: datos?.choices?.[0]?.finish_reason ?? null,
    modelo: datos?.model ?? null,
    uso: datos?.usage ?? null,
  };
}

/**
 * Una respuesta del proveedor activo. Es la unica puerta de salida hacia la
 * IA: todo lo que sale del equipo pasa por aqui.
 */
export async function completar({ messages, proveedor: idProveedor, modelo, temperature, maxTokens, jsonMode }) {
  const { proveedor, baseUrl, key, source } = await activo(idProveedor);

  if (proveedor.necesitaClave && !key) {
    throw new HttpError(
      400,
      `No hay una API key de ${proveedor.nombre} configurada. Guardala desde Configuracion o anade ${proveedor.variableEntorno} al archivo .env.`,
    );
  }

  const model = await resolverModelo(proveedor.id, modelo);
  if (!model) {
    throw new HttpError(400, proveedor.local
      ? 'No has elegido ningun modelo de Ollama. Descarga uno con "ollama pull" y seleccionalo en Configuracion.'
      : `No hay ningun modelo elegido para ${proveedor.nombre}.`);
  }

  const comun = { proveedor, baseUrl, key, modelo: model, messages, temperature, maxTokens };
  let { res, raw } = await pedir({ ...comun, jsonMode });

  if (!res.ok) {
    const { codigo, error } = describirError(res.status, raw, { proveedor, modelo: model, source, clave: key });
    // Algunos modelos fallan la validacion estricta de JSON del propio
    // proveedor. Se reintenta en modo texto y validamos nosotros la estructura.
    if (jsonMode && (codigo === 'json_validate_failed' || /response_format/i.test(error.message))) {
      ({ res, raw } = await pedir({ ...comun, jsonMode: false }));
      if (!res.ok) throw describirError(res.status, raw, { proveedor, modelo: model, source, clave: key }).error;
    } else {
      throw error;
    }
  }

  const datos = JSON.parse(raw);
  const { texto, motivo, modelo: devuelto, uso } = contenidoDe(datos, proveedor.protocolo);
  if (typeof texto !== 'string' || !texto.trim()) {
    throw new HttpError(
      502,
      motivo === 'length' || motivo === 'max_tokens'
        ? `${proveedor.nombre} agoto el limite de tokens antes de terminar la respuesta. Aumenta "Tokens maximos" en Configuracion.`
        : `${proveedor.nombre} devolvio una respuesta sin contenido utilizable.`,
    );
  }
  return { content: texto, usage: uso, model: devuelto ?? model, proveedor: proveedor.id };
}

// -------------------------------------------------- modelos y diagnostico

/** Anthropic no publicaba lista de modelos durante mucho tiempo: se listan aqui. */
const MODELOS_ANTHROPIC = [
  'claude-opus-4-1', 'claude-sonnet-4-5', 'claude-haiku-4-5',
];

export async function listarModelos(idProveedor) {
  const { proveedor, baseUrl, key } = await activo(idProveedor);
  if (proveedor.necesitaClave && !key) {
    throw new HttpError(400, `No hay una API key de ${proveedor.nombre} configurada.`);
  }

  if (proveedor.protocolo === 'anthropic') {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(20000),
    }).catch(() => null);
    if (res?.ok) {
      const datos = await res.json();
      const ids = (datos?.data ?? []).map((m) => ({ id: m.id, owned_by: 'anthropic' }));
      if (ids.length) return ids;
    }
    // Si no se puede preguntar, se dice que la lista es la conocida, no se
    // finge que viene del servicio.
    return MODELOS_ANTHROPIC.map((id) => ({ id, owned_by: 'anthropic', desdeLista: true }));
  }

  const res = await fetch(`${baseUrl}/models`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    signal: AbortSignal.timeout(proveedor.local ? 10000 : 20000),
  }).catch((err) => {
    throw new HttpError(502, proveedor.local
      ? `No se pudo hablar con Ollama en ${baseUrl}. Comprueba que esta funcionando ("ollama serve"). Detalle: ${err.message}`
      : `No se pudo contactar con ${proveedor.nombre}: ${err.message}`);
  });
  if (!res.ok) throw new HttpError(502, `${proveedor.nombre} devolvio ${res.status} al listar modelos.`);
  const datos = await res.json();
  return (datos?.data ?? []).map((m) => ({ id: m.id, owned_by: m.owned_by, context_window: m.context_window }));
}

/**
 * Comprueba de verdad si el proveedor activo responde.
 *
 * Existe porque saber que "hay una clave" no sirve de nada: la aplicacion
 * decia "configurado" mientras usaba una clave caducada del entorno del
 * sistema, y el fallo solo aparecia al documentar una funcion.
 */
export async function probarConexion(idProveedor) {
  const { proveedor, source } = await activo(idProveedor);
  const modelo = await resolverModelo(proveedor.id, null);

  let modelos;
  try {
    modelos = await listarModelos(idProveedor);
  } catch (err) {
    return { ok: false, proveedor: proveedor.id, nombre: proveedor.nombre, source, message: err.message };
  }

  const disponibles = modelos.map((m) => m.id);
  const tiene = Boolean(modelo) && disponibles.includes(modelo);
  const desdeLista = modelos.some((m) => m.desdeLista);

  if (!modelo) {
    return {
      ok: false, proveedor: proveedor.id, nombre: proveedor.nombre, source, modelos: disponibles,
      message: proveedor.local
        ? `Ollama responde y tiene ${disponibles.length} modelo(s), pero no has elegido ninguno.`
        : `${proveedor.nombre} responde, pero no has elegido ningun modelo.`,
    };
  }

  return {
    ok: true,
    proveedor: proveedor.id,
    nombre: proveedor.nombre,
    source,
    model: modelo,
    modelAvailable: tiene,
    message: tiene
      ? `Conexion correcta con ${proveedor.nombre}. El modelo "${modelo}" esta disponible.`
      : desdeLista
        ? `La clave funciona. No se pudo confirmar la lista de modelos de ${proveedor.nombre}, asi que no se ha comprobado si "${modelo}" existe.`
        : proveedor.local
          ? `Ollama responde, pero no tiene el modelo "${modelo}". Descargalo con "ollama pull ${modelo}".`
          : `La clave funciona, pero tu cuenta no tiene acceso al modelo "${modelo}". Elige otro de la lista.`,
  };
}

// ------------------------------------------------------------ streaming

/**
 * Una respuesta que llega a trozos.
 *
 * Esperar la respuesta completa hace que la aplicacion parezca lenta aunque
 * el modelo sea rapido: veinte segundos mirando un "pensando..." se sienten
 * mucho peor que veinte segundos viendo el texto aparecer. Aqui cada trozo se
 * entrega en cuanto llega, y al final se devuelve el texto entero igual que
 * `completar`, para quien necesite validarlo.
 *
 * Los dos protocolos mandan los trozos como "server-sent events", pero con
 * forma distinta: OpenAI en `choices[0].delta.content` y Anthropic en
 * eventos `content_block_delta` con `delta.text`.
 */
export async function completarStream(
  { messages, proveedor: idProveedor, modelo, temperature, maxTokens },
  alTrozo,
  { senal } = {},
) {
  const { proveedor, baseUrl, key, source } = await activo(idProveedor);
  if (proveedor.necesitaClave && !key) {
    throw new HttpError(400, `No hay una API key de ${proveedor.nombre} configurada. Guardala desde Configuracion o anade ${proveedor.variableEntorno} al archivo .env.`);
  }
  const model = await resolverModelo(proveedor.id, modelo);
  if (!model) throw new HttpError(400, `No hay ningun modelo elegido para ${proveedor.nombre}.`);

  const anthropic = proveedor.protocolo === 'anthropic';
  const headers = { 'Content-Type': 'application/json' };
  if (key) {
    if (anthropic) {
      headers['x-api-key'] = key;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers.Authorization = `Bearer ${key}`;
    }
  }
  const cuerpo = anthropic
    ? { ...cuerpoAnthropic({ modelo: model, messages, temperature, maxTokens }), stream: true }
    : { ...cuerpoOpenai({ modelo: model, messages, temperature, maxTokens, jsonMode: false }), stream: true };

  let res;
  try {
    res = await fetch(`${baseUrl}${anthropic ? '/messages' : '/chat/completions'}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(cuerpo),
      signal: senal ?? AbortSignal.timeout(proveedor.local ? 300000 : 120000),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new HttpError(499, 'Cancelado.');
    throw new HttpError(502, `No se pudo contactar con ${proveedor.nombre}: ${sinClave(err.message, key)}.`);
  }

  if (!res.ok) {
    throw describirError(res.status, await res.text(), { proveedor, modelo: model, source, clave: key }).error;
  }

  const lector = res.body.getReader();
  const dec = new TextDecoder();
  let pendiente = '';
  let texto = '';
  let modeloDevuelto = model;

  const procesarEvento = (linea) => {
    if (!linea.startsWith('data:')) return;
    const datos = linea.slice(5).trim();
    if (!datos || datos === '[DONE]') return;
    let json;
    try {
      json = JSON.parse(datos);
    } catch {
      return; // un trozo partido o un comentario: se ignora
    }
    const trozo = anthropic
      ? (json.type === 'content_block_delta' ? json.delta?.text : null)
      : json.choices?.[0]?.delta?.content;
    if (json.model) modeloDevuelto = json.model;
    if (json.type === 'message_start' && json.message?.model) modeloDevuelto = json.message.model;
    if (trozo) {
      texto += trozo;
      alTrozo(trozo);
    }
  };

  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    pendiente += dec.decode(value, { stream: true });
    // Los eventos se separan por saltos de linea; el ultimo puede venir a medias.
    const lineas = pendiente.split(/\r?\n/);
    pendiente = lineas.pop() ?? '';
    for (const linea of lineas) procesarEvento(linea);
  }
  if (pendiente) procesarEvento(pendiente);

  if (!texto.trim()) {
    throw new HttpError(502, `${proveedor.nombre} termino sin enviar ningun texto.`);
  }
  return { content: texto, model: modeloDevuelto, proveedor: proveedor.id };
}
