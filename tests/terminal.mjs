import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Prueba la consola del proyecto contra procesos de verdad.
 *
 * Lo que importa aqui es que los comandos se ejecuten de verdad, que la salida
 * llegue entera, que la interrupcion interrumpa y que al cerrar no quede nada
 * suelto. Si el equipo no puede abrir un pseudoterminal, el plan B por
 * tuberias tiene que seguir ejecutando: eso tambien se comprueba.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const terminal = await import(pathToFileURL(path.join(raiz, 'server/src/services/terminal.js')).href);

const fallos = [];
const comprobar = (condicion, texto) => { if (!condicion) fallos.push(texto); };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * La salida de un terminal trae secuencias de escape para el color, el titulo
 * de la ventana y el cursor. Para leerla aqui solo interesa el texto.
 */
const legible = (texto) =>
  texto
    .replace(/\u001b\][^\u0007]*\u0007/g, '')
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
const WINDOWS = process.platform === 'win32';

/** Lee hasta que aparezca lo que se busca, o se agote el plazo. */
async function esperarTexto(proyecto, sid, buscado, plazoMs = 20000) {
  const limite = Date.now() + plazoMs;
  let todo = '';
  let desde = 0;
  while (Date.now() < limite) {
    const { trozos } = terminal.leer(proyecto, sid, desde);
    for (const t of trozos) { todo += t.texto; desde = t.seq; }
    if (todo.includes(buscado)) return todo;
    await esperar(150);
  }
  return todo;
}

/** Espera a que la consola deje de escribir: el interprete ya esta listo. */
async function esperarQuietud(proyecto, sid, quietoMs = 700, plazoMs = 15000) {
  const limite = Date.now() + plazoMs;
  let desde = 0;
  let ultimo = Date.now();
  while (Date.now() < limite) {
    const { trozos } = terminal.leer(proyecto, sid, desde);
    if (trozos.length) {
      desde = trozos[trozos.length - 1].seq;
      ultimo = Date.now();
    } else if (Date.now() - ultimo > quietoMs) {
      return desde;
    }
    await esperar(100);
  }
  return desde;
}

const temporal = await fs.mkdtemp(path.join(os.tmpdir(), 'codemind-terminal-'));
await fs.writeFile(path.join(temporal, 'marca.txt'), 'contenido de prueba');

console.log('=== Que puede ofrecer este equipo');
const disponible = await terminal.disponibilidad();
console.log(`  interprete: ${disponible.shell}`);
console.log(`  modo: ${disponible.modo}${disponible.motivo ? ` (${disponible.motivo})` : ''}`);
comprobar(['terminal', 'tuberias'].includes(disponible.modo), 'el modo no es uno de los dos previstos');
comprobar(Boolean(disponible.shell), 'no se identifico ningun interprete');

console.log('\n=== Un comando de verdad');
const proyecto = 'prj_prueba';
const sesion = await terminal.abrir(proyecto, temporal, { cols: 100, rows: 30 });
comprobar(sesion.estado === 'viva', 'la sesion no quedo viva al abrirla');
comprobar(sesion.cwd === temporal, 'la consola no se abrio en la carpeta del proyecto');

// Hay que dejar que el interprete termine de arrancar y saque su prompt:
// escribirle antes de eso es escribirle a nadie.
await esperarQuietud(proyecto, sesion.id);

// Un comando que existe en los dos mundos y cuya salida es inconfundible.
const orden = WINDOWS ? 'Get-Content marca.txt\r' : 'cat marca.txt\r';
terminal.escribir(proyecto, sesion.id, orden);
const salida = await esperarTexto(proyecto, sesion.id, 'contenido de prueba');
for (const linea of legible(salida).slice(-3)) console.log('  ' + linea);
comprobar(salida.includes('contenido de prueba'), 'no llego la salida del comando');

if (disponible.modo === 'terminal') {
  comprobar(salida.includes('marca.txt'), 'con terminal deberia verse el eco de lo que se escribio');
}

console.log('\n=== La carpeta de trabajo es la del proyecto');
terminal.escribir(proyecto, sesion.id, WINDOWS ? '(Get-Location).Path\r' : 'pwd\r');
const donde = await esperarTexto(proyecto, sesion.id, path.basename(temporal), 15000);
comprobar(donde.includes(path.basename(temporal)), 'la consola no esta en la carpeta del proyecto');

console.log('\n=== Interrumpir de verdad');
// Un proceso que tardaria mucho: la prueba es que no se espera a que acabe.
const largo = WINDOWS ? 'Start-Sleep -Seconds 120\r' : 'sleep 120\r';
terminal.escribir(proyecto, sesion.id, largo);
await esperar(1500);
const inicio = Date.now();
terminal.interrumpir(proyecto, sesion.id);
// Tras interrumpir, el interprete debe volver a atender ordenes.
await esperar(800);
terminal.escribir(proyecto, sesion.id, WINDOWS ? 'echo VUELVO\r' : 'echo VUELVO\r');
const tras = await esperarTexto(proyecto, sesion.id, 'VUELVO', 20000);
const tardo = Date.now() - inicio;
for (const linea of legible(tras).slice(-2)) console.log('  ' + linea);
console.log(`  respondio de nuevo ${(tardo / 1000).toFixed(1)} s despues de interrumpir`);
comprobar(tras.includes('VUELVO'), 'la consola no volvio a responder despues de interrumpir');
comprobar(tardo < 60000, 'interrumpir no corto el proceso: se espero a que terminara solo');

console.log('\n=== Limites');
let rechazoVacio = false;
try { terminal.escribir(proyecto, sesion.id, ''); } catch (e) { rechazoVacio = e.status === 400; }
comprobar(rechazoVacio, 'acepto escribir una orden vacia');

let rechazoLargo = false;
try { terminal.escribir(proyecto, sesion.id, 'x'.repeat(200000)); } catch (e) { rechazoLargo = e.status === 400; }
comprobar(rechazoLargo, 'acepto un texto desmesurado en una sola orden');

let rechazoAjena = false;
try { terminal.leer(proyecto, 'no-existe'); } catch (e) { rechazoAjena = e.status === 404; }
comprobar(rechazoAjena, 'no rechazo una consola que no existe');

console.log('\n=== Cerrar no deja nada suelto');
terminal.cerrar(proyecto, sesion.id);
comprobar(terminal.listar(proyecto).length === 0, 'la sesion sigue en la lista despues de cerrarla');
let trasCerrar = false;
try { terminal.leer(proyecto, sesion.id); } catch (e) { trasCerrar = e.status === 404; }
comprobar(trasCerrar, 'se puede seguir leyendo una consola ya cerrada');

// Y que cerrarTodas no falle aunque no quede ninguna.
terminal.cerrarTodas();

// El interprete tenia esa carpeta como suya: Windows no la suelta al
// instante, asi que se reintenta un poco antes de rendirse.
for (let intento = 0; intento < 20; intento++) {
  try {
    await fs.rm(temporal, { recursive: true, force: true });
    break;
  } catch {
    await esperar(250);
  }
}

console.log('\n=== Comprobaciones');
if (fallos.length) {
  for (const f of fallos) console.log('  FALLO:', f);
  process.exit(1);
}
console.log(`  Todo correcto: ${disponible.modo === 'terminal' ? 'terminal real' : 'plan B por tuberias'}, comandos, carpeta, interrupcion y cierre.`);
process.exit(0);
