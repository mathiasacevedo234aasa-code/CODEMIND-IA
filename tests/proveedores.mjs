import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Prueba la capa de proveedores de IA.
 *
 * No llama a ningun servicio real: sustituye `fetch` y mira exactamente que
 * se envia y como se interpreta lo que llega. Eso es justo lo que puede
 * romperse al soportar varios proveedores: mandarle a Anthropic el cuerpo de
 * OpenAI, poner la clave en la cabecera equivocada, o colar la clave en un
 * mensaje de error que acaba en pantalla.
 *
 * Se usa una carpeta de datos temporal para no tocar los ajustes reales.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datos = await fs.mkdtemp(path.join(os.tmpdir(), 'codemind-proveedores-'));
process.env.CODEMIND_DATA_DIR = datos;
// Que una variable del sistema no se cuele en la prueba.
for (const v of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY']) delete process.env[v];

const store = await import(pathToFileURL(path.join(raiz, 'server/src/services/store.js')).href);
const prov = await import(pathToFileURL(path.join(raiz, 'server/src/services/proveedores.js')).href);

const fallos = [];
const comprobar = (condicion, texto) => { if (!condicion) fallos.push(texto); };

const CLAVE_GROQ = 'gsk_claveFalsaDePruebaSoloParaEsto';
const CLAVE_ANTHROPIC = 'sk-ant-claveFalsaDePruebaSoloParaEsto';

await store.ensureDataDirs();
await store.setStoredApiKey('groq', CLAVE_GROQ);
await store.setStoredApiKey('anthropic', CLAVE_ANTHROPIC);

/** Lo que se envio en la ultima peticion, para poder mirarlo. */
let ultima = null;
const fetchReal = globalThis.fetch;

/** Sustituye fetch por una respuesta fija y guarda lo que se le pidio. */
function interceptar(responder) {
  globalThis.fetch = async (url, init = {}) => {
    ultima = {
      url: String(url),
      metodo: init.method ?? 'GET',
      cabeceras: init.headers ?? {},
      cuerpo: init.body ? JSON.parse(init.body) : null,
    };
    const { estado = 200, texto = '{}' } = responder(ultima) ?? {};
    return new Response(texto, { status: estado, headers: { 'Content-Type': 'application/json' } });
  };
}

const MENSAJES = [
  { role: 'system', content: 'Eres un asistente.' },
  { role: 'user', content: 'Hola.' },
];

// ------------------------------------------------- protocolo de OpenAI
console.log('=== Protocolo de OpenAI (Groq)');
await store.writeSettings({ ...store.DEFAULT_SETTINGS, proveedor: 'groq', modelos: { groq: 'modelo-de-prueba' } });

interceptar(() => ({
  texto: JSON.stringify({
    model: 'modelo-de-prueba',
    choices: [{ message: { content: 'respuesta de groq' }, finish_reason: 'stop' }],
    usage: { total_tokens: 12 },
  }),
}));

let r = await prov.completar({ messages: MENSAJES, temperature: 0.2, maxTokens: 500, jsonMode: true });
console.log(`  ${ultima.metodo} ${ultima.url}`);
console.log(`  autorizacion: ${String(ultima.cabeceras.Authorization).slice(0, 12)}...`);
console.log(`  respuesta: "${r.content}"`);
comprobar(ultima.url.endsWith('/chat/completions'), 'OpenAI: no llamo a /chat/completions');
comprobar(ultima.cabeceras.Authorization === `Bearer ${CLAVE_GROQ}`, 'OpenAI: la clave no va en Authorization: Bearer');
comprobar(ultima.cuerpo.model === 'modelo-de-prueba', 'OpenAI: no uso el modelo guardado para ese proveedor');
comprobar(ultima.cuerpo.messages.length === 2, 'OpenAI: el mensaje de sistema deberia ir dentro de messages');
comprobar(ultima.cuerpo.response_format?.type === 'json_object', 'OpenAI: no pidio respuesta en JSON');
comprobar(r.content === 'respuesta de groq' && r.proveedor === 'groq', 'OpenAI: no leyo bien la respuesta');

// ---------------------------------------------- protocolo de Anthropic
console.log('\n=== Protocolo de Anthropic');
await store.writeSettings({ ...store.DEFAULT_SETTINGS, proveedor: 'anthropic', modelos: { anthropic: 'claude-de-prueba' } });

interceptar(() => ({
  texto: JSON.stringify({
    model: 'claude-de-prueba',
    content: [{ type: 'text', text: 'respuesta de anthropic' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 4, output_tokens: 6 },
  }),
}));

r = await prov.completar({ messages: MENSAJES, temperature: 0.2, maxTokens: 500, jsonMode: true });
console.log(`  ${ultima.metodo} ${ultima.url}`);
console.log(`  cabeceras propias: x-api-key=${String(ultima.cabeceras['x-api-key']).slice(0, 10)}..., anthropic-version=${ultima.cabeceras['anthropic-version']}`);
console.log(`  respuesta: "${r.content}"`);
comprobar(ultima.url.endsWith('/messages'), 'Anthropic: deberia llamar a /messages, no a /chat/completions');
comprobar(ultima.cabeceras['x-api-key'] === CLAVE_ANTHROPIC, 'Anthropic: la clave no va en x-api-key');
comprobar(!ultima.cabeceras.Authorization, 'Anthropic: no debe mandarse tambien Authorization');
comprobar(Boolean(ultima.cabeceras['anthropic-version']), 'Anthropic: falta la cabecera de version, que es obligatoria');
comprobar(ultima.cuerpo.system === 'Eres un asistente.', 'Anthropic: el mensaje de sistema va aparte, no dentro de messages');
comprobar(ultima.cuerpo.messages.length === 1, 'Anthropic: el sistema no deberia repetirse dentro de messages');
comprobar(!('response_format' in ultima.cuerpo), 'Anthropic: no admite response_format y no debe enviarse');
comprobar(r.content === 'respuesta de anthropic', 'Anthropic: no leyo bien el contenido por bloques');

// --------------------------------------------------------- Ollama local
console.log('\n=== Ollama (local, sin clave)');
await store.writeSettings({
  ...store.DEFAULT_SETTINGS,
  proveedor: 'ollama',
  ollamaUrl: 'http://127.0.0.1:9999/v1',
  modelos: { ollama: 'llama-de-prueba' },
});

interceptar(() => ({
  texto: JSON.stringify({ model: 'llama-de-prueba', choices: [{ message: { content: 'desde tu equipo' }, finish_reason: 'stop' }] }),
}));

r = await prov.completar({ messages: MENSAJES, temperature: 0.2, maxTokens: 500 });
console.log(`  ${ultima.metodo} ${ultima.url}`);
comprobar(ultima.url === 'http://127.0.0.1:9999/v1/chat/completions', 'Ollama: no respeto la direccion configurada');
comprobar(!ultima.cabeceras.Authorization, 'Ollama: no debe mandarse ninguna clave a un servicio local');
comprobar(r.content === 'desde tu equipo', 'Ollama: no leyo la respuesta');

// ------------------------------- Ollama contra un servidor de verdad
//
// Lo anterior comprueba que se envia lo correcto, pero sustituyendo fetch.
// Esto levanta un servidor que habla el mismo dialecto que Ollama y recorre
// el camino entero por un socket real: listar modelos, probar la conexion y
// pedir una respuesta. No prueba a Ollama —para eso hay que instalarlo—,
// prueba que nuestro lado del protocolo esta bien.
console.log('\n=== Ollama contra un servidor real');
globalThis.fetch = fetchReal;

const servidor = http.createServer((req, res) => {
  const responder = (obj) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  if (req.url.endsWith('/models')) {
    return responder({ data: [{ id: 'llama3.2', owned_by: 'library' }, { id: 'qwen2.5-coder', owned_by: 'library' }] });
  }
  let cuerpo = '';
  req.on('data', (t) => { cuerpo += t; });
  req.on('end', () => {
    const recibido = JSON.parse(cuerpo || '{}');
    responder({
      model: recibido.model,
      choices: [{ message: { content: `eco de ${recibido.messages.at(-1).content}` }, finish_reason: 'stop' }],
    });
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const puerto = servidor.address().port;

await store.writeSettings({
  ...store.DEFAULT_SETTINGS,
  proveedor: 'ollama',
  ollamaUrl: `http://127.0.0.1:${puerto}/v1`,
  modelos: { ollama: 'llama3.2' },
});

const listados = await prov.listarModelos('ollama');
console.log(`  modelos: ${listados.map((m) => m.id).join(', ')}`);
comprobar(listados.length === 2, 'no leyo la lista de modelos por HTTP real');

const prueba = await prov.probarConexion('ollama');
console.log(`  prueba: ${prueba.message}`);
comprobar(prueba.ok && prueba.modelAvailable, 'la prueba de conexion no reconocio el modelo descargado');

const respuesta = await prov.completar({ messages: MENSAJES, temperature: 0.2, maxTokens: 200 });
console.log(`  respuesta: "${respuesta.content}"`);
comprobar(respuesta.content === 'eco de Hola.', 'no completo por el camino real');

// Y si el modelo elegido no esta descargado, hay que decirlo con claridad.
await store.writeSettings({
  ...store.DEFAULT_SETTINGS,
  proveedor: 'ollama',
  ollamaUrl: `http://127.0.0.1:${puerto}/v1`,
  modelos: { ollama: 'modelo-que-no-he-descargado' },
});
const sinModelo = await prov.probarConexion('ollama');
console.log(`  sin descargar: ${sinModelo.message}`);
comprobar(/ollama pull/.test(sinModelo.message), 'no dice como descargar el modelo que falta');

await new Promise((r) => servidor.close(r));

// ------------------------------------------------- errores comprensibles
console.log('\n=== Errores');
await store.writeSettings({ ...store.DEFAULT_SETTINGS, proveedor: 'groq', modelos: { groq: 'modelo-que-no-existe' } });

const casos = [
  [401, '{"error":{"message":"Invalid API Key"}}', /rechazo la API key/i, 'clave invalida'],
  [404, '{"error":{"message":"model not found"}}', /no reconoce el modelo/i, 'modelo inexistente'],
  [429, '{"error":{"message":"rate limit"}}', /limite de uso/i, 'limite de uso'],
];
for (const [estado, cuerpo, patron, nombre] of casos) {
  interceptar(() => ({ estado, texto: cuerpo }));
  let mensaje = '';
  try {
    await prov.completar({ messages: MENSAJES, temperature: 0.2, maxTokens: 500 });
  } catch (err) {
    mensaje = err.message;
  }
  console.log(`  ${estado}: ${mensaje.slice(0, 95)}`);
  comprobar(patron.test(mensaje), `${nombre}: el mensaje no explica el problema (${mensaje})`);
  // Lo mas importante de todo: la clave jamas puede acabar en un mensaje.
  comprobar(!mensaje.includes(CLAVE_GROQ), `${nombre}: EL MENSAJE DE ERROR CONTIENE LA API KEY`);
}

// Un fallo de red tampoco puede filtrar la clave.
globalThis.fetch = async () => { throw new Error(`falla la red con ${CLAVE_GROQ}`); };
let mensajeRed = '';
try {
  await prov.completar({ messages: MENSAJES, temperature: 0.2, maxTokens: 500 });
} catch (err) {
  mensajeRed = err.message;
}
console.log(`  red caida: ${mensajeRed.slice(0, 95)}`);
comprobar(!mensajeRed.includes(CLAVE_GROQ), 'UN FALLO DE RED ARRASTRA LA API KEY HASTA EL MENSAJE');
comprobar(/No se pudo contactar/.test(mensajeRed), 'el fallo de red no se explica');

// ------------------------------------------- cada proveedor, su clave
console.log('\n=== Cada proveedor guarda su clave');
const deGroq = await store.getApiKey('groq');
const deAnthropic = await store.getApiKey('anthropic');
const deOpenai = await store.getApiKey('openai');
console.log(`  groq: ${deGroq.source} | anthropic: ${deAnthropic.source} | openai: ${deOpenai.source ?? 'sin clave'}`);
comprobar(deGroq.key === CLAVE_GROQ && deAnthropic.key === CLAVE_ANTHROPIC, 'las claves se mezclan entre proveedores');
comprobar(deOpenai.key === null, 'aparece una clave donde no se guardo ninguna');

await store.clearStoredApiKey('groq');
// Ojo: al borrar la guardada se vuelve a mirar el .env del proyecto y la
// variable del sistema, que es justo lo que debe pasar. Lo que se comprueba
// es que la GUARDADA desaparecio, no que no quede ninguna clave posible.
const trasBorrar = await store.getApiKey('groq');
comprobar(trasBorrar.key !== CLAVE_GROQ, 'borrar la clave guardada no la borra');
comprobar(trasBorrar.source !== 'guardada', `tras borrarla el origen sigue siendo "${trasBorrar.source}"`);
comprobar((await store.getApiKey('anthropic')).key === CLAVE_ANTHROPIC, 'borrar una clave se llevo por delante la de otro proveedor');

// Un proveedor inventado no puede dejar la aplicacion sin poder llamar a nadie.
let rechazado = false;
try { prov.descriptor('inventado'); } catch (err) { rechazado = err.status === 400; }
comprobar(rechazado, 'acepto un proveedor que no existe');

globalThis.fetch = fetchReal;
await fs.rm(datos, { recursive: true, force: true });

console.log('\n=== Comprobaciones');
if (fallos.length) {
  for (const f of fallos) console.log('  FALLO:', f);
  process.exit(1);
}
console.log('  Todo correcto: los dos protocolos, Ollama local, los errores y las claves separadas.');
