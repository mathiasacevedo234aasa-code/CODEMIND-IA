import http from 'node:http';
import { fileURLToPath } from 'node:url';

/**
 * Un proveedor de IA de mentira, compatible con el dialecto de OpenAI.
 *
 * Sirve para probar todo lo que pasa ALREDEDOR del modelo —la cola de
 * documentar un archivo, el streaming, los errores— sin depender de una
 * clave válida, de la red ni de lo que un modelo de verdad decida contestar
 * ese día. Lo que se prueba aquí es nuestro lado, no la calidad de la IA.
 *
 * Se puede usar de dos maneras:
 *   - importada desde una prueba:  const ia = await arrancarIaFalsa();
 *   - a mano, para probar la aplicación:  node tests/ia-falsa.mjs
 *     (escucha en 127.0.0.1:11500; en Configuración elige "Ollama" y pon
 *     http://127.0.0.1:11500/v1 como dirección)
 */

const RESPUESTA_CHAT =
  'Esta función recorre la lista de artículos y suma el precio de cada uno multiplicado por su cantidad. ' +
  'Devuelve el total sin impuestos. No modifica la lista que recibe.';

/** El nombre del primer elemento que aparezca en el código recibido. */
function nombreDelCodigo(texto) {
  const m = /function\s+(\w+)|const\s+(\w+)|def\s+(\w+)|class\s+(\w+)/.exec(texto);
  return m ? (m[1] ?? m[2] ?? m[3] ?? m[4]) : 'elemento';
}

function documentacionFalsa(nombre) {
  return {
    nombre,
    proposito: `Propósito de ${nombre}, generado por la IA de pruebas.`,
    explicacion: `Explicación de ${nombre}. Este texto lo produce un servidor de pruebas, no un modelo real.`,
    parametros: [],
    retorno: { descripcion: 'No aplica a este tipo de elemento', tipo: null, certeza: 'confirmado' },
    flujo: ['Primer paso.', 'Segundo paso.'],
    dependencias: [],
    ejemplo: `${nombre}()`,
    observaciones: 'Generado por tests/ia-falsa.mjs.',
    incertidumbres: [],
  };
}

export async function arrancarIaFalsa({ puerto = 0, retrasoMs = 25, fallarCon = null } = {}) {
  const peticiones = [];

  const servidor = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'modelo-falso', owned_by: 'pruebas' }] }));
      return;
    }

    let cuerpo = '';
    req.on('data', (t) => { cuerpo += t; });
    req.on('end', async () => {
      const pedido = JSON.parse(cuerpo || '{}');
      peticiones.push(pedido);

      // Para probar como reacciona la aplicacion a un error del proveedor.
      if (fallarCon) {
        res.writeHead(fallarCon, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `fallo simulado ${fallarCon}` } }));
        return;
      }

      const usuario = pedido.messages?.findLast?.((m) => m.role === 'user')?.content ?? '';
      const quiereJson = pedido.response_format?.type === 'json_object'
        || /Devuelve EXCLUSIVAMENTE un objeto JSON/.test(pedido.messages?.[0]?.content ?? '');
      const texto = quiereJson
        ? JSON.stringify(documentacionFalsa(nombreDelCodigo(usuario)))
        : RESPUESTA_CHAT;

      if (pedido.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        // A trozos de verdad, con pausas, para que se note si la aplicacion
        // espera a tenerlo todo o lo enseña segun llega.
        const trozos = texto.match(/\S+\s*/g) ?? [texto];
        for (const trozo of trozos) {
          res.write(`data: ${JSON.stringify({ model: 'modelo-falso', choices: [{ delta: { content: trozo } }] })}\n\n`);
          await new Promise((r) => setTimeout(r, retrasoMs));
        }
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        model: 'modelo-falso',
        choices: [{ message: { content: texto }, finish_reason: 'stop' }],
        usage: { total_tokens: 42 },
      }));
    });
  });

  await new Promise((r) => servidor.listen(puerto, '127.0.0.1', r));
  const url = `http://127.0.0.1:${servidor.address().port}/v1`;
  return {
    url,
    peticiones,
    cerrar: () => new Promise((r) => { servidor.closeAllConnections?.(); servidor.close(r); }),
  };
}

// Ejecutado directamente: se queda escuchando para probar la aplicacion a mano.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ia = await arrancarIaFalsa({ puerto: 11500, retrasoMs: 60 });
  console.log(`IA de pruebas escuchando en ${ia.url}`);
}
