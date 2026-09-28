import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Prueba el servidor de vista previa.
 *
 * Sirve archivos del disco del usuario, asi que lo que mas importa es que no
 * sirva nada de fuera de la carpeta del proyecto, por muy retorcida que venga
 * la ruta. Lo demas —tipos de contenido, recarga automatica, indice de
 * carpeta— es lo que hace que sea util.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const live = await import(pathToFileURL(path.join(raiz, 'server/src/services/liveserver.js')).href);

const fallos = [];
const comprobar = (condicion, texto) => { if (!condicion) fallos.push(texto); };
const NL = String.fromCharCode(10);

// Un proyecto con una pagina, un script, una imagen y una subcarpeta.
const proyecto = await fs.mkdtemp(path.join(os.tmpdir(), 'codemind-preview-'));
await fs.mkdir(path.join(proyecto, 'assets'), { recursive: true });
await fs.mkdir(path.join(proyecto, 'sinindice'), { recursive: true });
await fs.writeFile(path.join(proyecto, 'index.html'), [
  '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Prueba</title></head>',
  '<body><h1>Hola</h1><script src="assets/app.js"></script></body></html>',
].join(NL));
await fs.writeFile(path.join(proyecto, 'assets', 'app.js'), 'console.log("hola");' + NL);
await fs.writeFile(path.join(proyecto, 'assets', 'estilo.css'), 'body { color: red; }' + NL);
await fs.writeFile(path.join(proyecto, 'sinindice', 'nota.txt'), 'una nota');

// Un archivo FUERA del proyecto: nadie deberia poder pedirlo.
const fuera = await fs.mkdtemp(path.join(os.tmpdir(), 'codemind-fuera-'));
await fs.writeFile(path.join(fuera, 'secreto.txt'), 'ESTO NO DEBE SALIR NUNCA');

console.log('=== Arranque');
const info = await live.arrancar('prj_prueba', proyecto);
console.log(`  ${info.url} sobre ${path.basename(info.raiz)} (entrada: ${info.entrada})`);
comprobar(info.url.startsWith('http://127.0.0.1:'), 'no escucha solo en 127.0.0.1');
comprobar(info.entrada === 'index.html', `no encontro la pagina de entrada (dijo ${info.entrada})`);

const pedir = async (ruta) => {
  const r = await fetch(info.url + ruta, { redirect: 'manual' });
  return { estado: r.status, tipo: r.headers.get('content-type') ?? '', texto: await r.text() };
};

console.log('\n=== Lo que sirve');
const pagina = await pedir('/');
console.log(`  /            ${pagina.estado} ${pagina.tipo}`);
comprobar(pagina.estado === 200, 'no sirve la pagina de entrada');
comprobar(pagina.texto.includes('<h1>Hola</h1>'), 'la pagina servida no es la del proyecto');
comprobar(pagina.texto.includes('__codemind/eventos'), 'no inyecta el script de recarga');
comprobar(/text\/html/.test(pagina.tipo), 'la pagina no se sirve como HTML');

const script = await pedir('/assets/app.js');
console.log(`  app.js       ${script.estado} ${script.tipo}`);
comprobar(/javascript/.test(script.tipo), `el .js se sirve como "${script.tipo}", y asi no lo ejecuta el navegador`);
comprobar(!script.texto.includes('__codemind'), 'inyecta el script de recarga dentro de un .js, que lo rompe');

const css = await pedir('/assets/estilo.css');
comprobar(/text\/css/.test(css.tipo), `el .css se sirve como "${css.tipo}"`);

console.log('\n=== Carpeta sin indice');
const carpeta = await pedir('/sinindice/');
console.log(`  ${carpeta.estado}, lista ${carpeta.texto.includes('nota.txt') ? 'con' : 'SIN'} sus archivos`);
comprobar(carpeta.estado === 200 && carpeta.texto.includes('nota.txt'), 'una carpeta sin indice deberia listar lo que tiene');

console.log('\n=== No existe');
const perdido = await pedir('/no-esta-aqui.html');
console.log(`  ${perdido.estado}`);
comprobar(perdido.estado === 404, 'un archivo que no existe deberia dar 404');

console.log('\n=== No se sale de la carpeta');
// Las formas habituales de intentar escaparse, incluidas las codificadas.
const nombreFuera = path.basename(fuera);
const intentos = [
  '/../' + nombreFuera + '/secreto.txt',
  '/..%2f' + nombreFuera + '%2fsecreto.txt',
  '/%2e%2e%2f' + nombreFuera + '%2fsecreto.txt',
  '/....//' + nombreFuera + '/secreto.txt',
  '/assets/../../' + nombreFuera + '/secreto.txt',
];
for (const intento of intentos) {
  const r = await pedir(intento);
  const filtrado = r.texto.includes('ESTO NO DEBE SALIR NUNCA');
  console.log(`  ${intento.slice(0, 44).padEnd(46)} ${r.estado} ${filtrado ? 'FILTRA EL ARCHIVO' : 'bloqueado'}`);
  comprobar(!filtrado, `SIRVE UN ARCHIVO DE FUERA DEL PROYECTO con "${intento}"`);
}

console.log('\n=== Recarga al guardar');
const avisos = [];
const escucha = fetch(info.url + '/__codemind/eventos').then(async (res) => {
  const lector = res.body.getReader();
  const dec = new TextDecoder();
  const limite = Date.now() + 12000;
  let acumulado = '';
  while (Date.now() < limite) {
    const { value, done } = await lector.read();
    if (done) break;
    acumulado += dec.decode(value);
    if (acumulado.includes('event: cambio')) { avisos.push('cambio'); break; }
  }
});
await new Promise((r) => setTimeout(r, 800));
await fs.appendFile(path.join(proyecto, 'index.html'), '<!-- tocado -->');
await escucha;
console.log(`  avisos recibidos: ${avisos.length}`);
comprobar(avisos.length > 0, 'guardar un archivo no avisa a la pagina para que se recargue');

console.log('\n=== Al detener no queda nada abierto');
const puerto = info.puerto;
await live.detener('prj_prueba');
comprobar(live.estado('prj_prueba').activo === false, 'sigue diciendo que esta activo despues de detenerlo');
const tras = await fetch(`http://127.0.0.1:${puerto}/`, { signal: AbortSignal.timeout(2500) })
  .then(() => true).catch(() => false);
console.log(`  el puerto ${puerto} ${tras ? 'SIGUE RESPONDIENDO' : 'quedo libre'}`);
comprobar(!tras, 'el puerto sigue ocupado despues de detener la vista previa');

await fs.rm(proyecto, { recursive: true, force: true });
await fs.rm(fuera, { recursive: true, force: true });

console.log('\n=== Comprobaciones');
if (fallos.length) {
  for (const f of fallos) console.log('  FALLO:', f);
  process.exit(1);
}
console.log('  Todo correcto: sirve, no se sale de la carpeta, recarga al guardar y suelta el puerto.');
process.exit(0);
