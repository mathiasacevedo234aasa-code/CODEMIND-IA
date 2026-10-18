import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../env.js';
import { HttpError, readJson, readSettings, writeJson } from './store.js';

/**
 * Lo que se manda a la IA y lo que cuesta.
 *
 * - Historial EXACTO de envíos: los mensajes tal cual salieron (sistema,
 *   contexto y pregunta), con proveedor, modelo y tokens. Se queda en este
 *   equipo, en la carpeta de datos; nunca viaja a ningún sitio. Últimos 100.
 * - Gasto del mes: con los tokens que informa el proveedor (o una estimación
 *   si no los da) y el precio que el usuario puso para ese modelo. Sin
 *   precio, el gasto de ese modelo no se puede calcular y se dice.
 * - Límite de gasto: si el gasto del mes alcanza el límite, no se envía nada
 *   y se explica por qué.
 */

const archivoEnvios = path.join(DATA_DIR, 'envios.jsonl');
const archivoGasto = path.join(DATA_DIR, 'gasto.json');
const MAX_ENVIOS = 100;

const mesActual = () => new Date().toISOString().slice(0, 7);
const estimarTokens = (texto) => Math.ceil(String(texto ?? '').length / 4);

export async function gastoDelMes() {
  const datos = await readJson(archivoGasto, { meses: {} });
  return { mes: mesActual(), ...(datos.meses?.[mesActual()] ?? { usd: 0, tokens: 0, envios: 0, sinPrecio: 0 }) };
}

/** Antes de enviar: ¿se ha llegado al límite de este mes? */
export async function comprobarLimite() {
  const settings = await readSettings();
  const limite = Number(settings.limiteGasto) || 0;
  if (!limite) return;
  const { usd } = await gastoDelMes();
  if (usd >= limite) {
    const f = (n) => (n < 0.01 ? n.toFixed(6) : n.toFixed(2));
    throw new HttpError(402, `Se alcanzó el límite de gasto de este mes (${f(usd)} de ${f(limite)} USD). Súbelo o quítalo en Configuración si quieres seguir.`);
  }
}

/** Después de una respuesta: se apunta el envío y su coste. Nunca hace fallar la respuesta. */
export async function registrar({ proveedor, modelo, messages, respuesta, usage }) {
  try {
    const settings = await readSettings();
    const entrada = usage?.prompt_tokens ?? usage?.input_tokens ?? estimarTokens(messages.map((m) => m.content).join('\n'));
    const salida = usage?.completion_tokens ?? usage?.output_tokens ?? estimarTokens(respuesta);
    const estimado = !(usage?.prompt_tokens ?? usage?.input_tokens);
    const precio = settings.precios?.[`${proveedor}:${settings.modelos?.[proveedor] ?? ''}`]
      ?? settings.precios?.[`${proveedor}:${modelo}`];
    const local = proveedor === 'ollama';
    const usd = local ? 0 : precio ? (entrada * (precio.entrada || 0) + salida * (precio.salida || 0)) / 1e6 : null;

    const datos = await readJson(archivoGasto, { meses: {} });
    const mes = datos.meses[mesActual()] ?? { usd: 0, tokens: 0, envios: 0, sinPrecio: 0 };
    mes.tokens += entrada + salida;
    mes.envios += 1;
    if (usd === null) mes.sinPrecio += 1;
    else mes.usd += usd;
    datos.meses[mesActual()] = mes;
    await writeJson(archivoGasto, datos);

    const linea = JSON.stringify({
      en: new Date().toISOString(), proveedor, modelo, tokens: { entrada, salida, estimado }, usd,
      mensajes: messages.map((m) => ({ role: m.role, content: String(m.content) })),
      respuesta: String(respuesta ?? '').slice(0, 20000),
    });
    const previas = (await fs.readFile(archivoEnvios, 'utf8').catch(() => '')).split('\n').filter(Boolean);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(archivoEnvios, [...previas.slice(-(MAX_ENVIOS - 1)), linea].join('\n') + '\n', 'utf8');
  } catch {
    /* llevar la cuenta es una ayuda: si falla, la respuesta llega igual */
  }
}

export async function listarEnvios() {
  const lineas = (await fs.readFile(archivoEnvios, 'utf8').catch(() => '')).split('\n').filter(Boolean);
  return lineas.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
}

export async function borrarEnvios() {
  await fs.rm(archivoEnvios, { force: true });
}
