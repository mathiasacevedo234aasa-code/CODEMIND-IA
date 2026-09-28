import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Prueba la ejecucion de un archivo suelto.
 *
 * Lo que importa aqui es que no se ofrezca nunca un boton que va a fallar, y
 * que el comando que se manda al terminal sea correcto pase lo que pase con
 * el nombre del archivo. Un nombre con comillas o un espacio no puede
 * convertirse en dos comandos.
 */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = await import(pathToFileURL(path.join(raiz, 'server/src/services/lenguajes.js')).href);

const fallos = [];
const comprobar = (condicion, texto) => { if (!condicion) fallos.push(texto); };
const WINDOWS = process.platform === 'win32';

const temporal = await fs.mkdtemp(path.join(os.tmpdir(), 'codemind-ejecutar-'));

console.log('=== Que puede ejecutar este equipo');
const lenguajes = await L.resumen();
const listos = lenguajes.filter((l) => l.disponible);
console.log('  listos: ' + (listos.map((l) => `${l.lenguaje} ${l.version}`).join(', ') || '(ninguno)'));
console.log('  faltan: ' + lenguajes.filter((l) => !l.disponible).map((l) => l.lenguaje).join(', '));

comprobar(lenguajes.length > 10, 'la lista de lenguajes esta vacia o es demasiado corta');
// Node esta ejecutando esta misma prueba: si no se detecta, la deteccion no sirve.
const node = lenguajes.find((l) => l.lenguaje === 'JavaScript');
comprobar(node?.disponible === true, 'no detecta Node, que es quien esta ejecutando esta prueba');
comprobar(Boolean(node?.version), 'detecta Node pero sin version');

// Lo que falta tiene que decir DONDE se consigue: es la diferencia entre un
// callejon sin salida y algo que el usuario puede resolver.
for (const l of lenguajes.filter((x) => !x.disponible)) {
  comprobar(Boolean(l.donde), `"${l.lenguaje}" no esta y no se dice de donde se descarga`);
}

console.log('\n=== Planes por extension');
const casos = ['hola.py', 'hola.js', 'hola.ts', 'Hola.java', 'hola.rb', 'script.sh'];
for (const nombre of casos) {
  await fs.writeFile(path.join(temporal, nombre), '# nada\n');
  const plan = await L.planPara(temporal, nombre);
  console.log(`  ${nombre.padEnd(12)} ${plan.soportado ? (plan.disponible ? 'SI ' : 'no ') : '?? '} ${(plan.lenguaje ?? '').padEnd(11)} ${plan.comando ?? ''}`);
  comprobar(plan.soportado, `no reconoce como ejecutar ${nombre}`);
  comprobar(Boolean(plan.comando), `${nombre}: plan sin comando`);
  // Si no se puede, hay que decir por que. Siempre.
  if (!plan.disponible) comprobar(Boolean(plan.motivo), `${nombre}: no se puede ejecutar y no se explica por que`);
}

console.log('\n=== Lo que no se sabe ejecutar');
await fs.writeFile(path.join(temporal, 'notas.txt'), 'hola');
const texto = await L.planPara(temporal, 'notas.txt');
console.log('  notas.txt:', texto.motivo);
comprobar(texto.soportado === false, 'dice que sabe ejecutar un .txt');
comprobar(/Terminal/i.test(texto.motivo), 'no sugiere la alternativa (escribirlo en el Terminal)');

const sinExtension = await L.planPara(temporal, 'LEEME');
comprobar(sinExtension.soportado === false, 'dice que sabe ejecutar un archivo sin extension');

console.log('\n=== Nombres de archivo dificiles');
// Un nombre con comillas o espacios no puede partir el comando en dos.
const raros = WINDOWS
  ? ['con espacio.py', "con'comilla.py"]
  : ['con espacio.py', "con'comilla.py", 'con"dobles.py', 'con;puntoycoma.py'];
for (const nombre of raros) {
  await fs.writeFile(path.join(temporal, nombre), 'print("ok")\n');
  const plan = await L.planPara(temporal, nombre);
  console.log(`  ${nombre.padEnd(22)} -> ${plan.comando}`);
  // El nombre entero tiene que ir dentro de las comillas, no suelto.
  const trozos = plan.comando.split(' ');
  comprobar(trozos[0] === 'python', `${nombre}: el comando no empieza por el interprete`);
  comprobar(plan.comando.includes(nombre.replace(/'/g, WINDOWS ? "''" : `'\\''`)),
    `${nombre}: el nombre no aparece correctamente entrecomillado`);
}

console.log('\n=== No se sale del proyecto');
for (const intento of ['../fuera.py', '..\\fuera.py', '/etc/passwd', 'sub/../../fuera.py']) {
  let rechazado = false;
  try {
    await L.planPara(temporal, intento);
  } catch (err) {
    rechazado = err.status === 400;
  }
  console.log(`  ${intento.padEnd(20)} ${rechazado ? 'rechazado' : 'ACEPTADO'}`);
  comprobar(rechazado, `deja apuntar fuera del proyecto con "${intento}"`);
}

console.log('\n=== Ejecutar de verdad');
// Node esta garantizado: es quien corre esta prueba. Se comprueba que el
// comando que se generaria funciona, ejecutandolo tal cual.
await fs.writeFile(path.join(temporal, 'suma.js'), 'console.log("resultado:", 20 + 22);\n');
const planJs = await L.planPara(temporal, 'suma.js');
const { exec } = await import('node:child_process');
const salida = await new Promise((resolve) => {
  exec(planJs.comando, { cwd: temporal, windowsHide: true, timeout: 20000, shell: WINDOWS ? 'powershell.exe' : undefined },
    (err, stdout, stderr) => resolve(`${stdout ?? ''}${stderr ?? ''}`));
});
console.log('  ' + salida.trim().split('\n').slice(-2).join(' | '));
comprobar(salida.includes('resultado: 42'), `el comando generado no funciona: ${planJs.comando} -> ${salida.slice(0, 200)}`);

/**
 * El contrato del que depende la interfaz.
 *
 * Ejecutar un archivo abre una consola en el backend, y la respuesta tiene que
 * decir CUAL, para que el panel del Terminal se enganche a esa. Este fue un
 * fallo real: el archivo se ejecutaba de verdad, pero el panel seguia
 * enseñando "Abrir la consola" y parecia que no pasaba nada.
 *
 * Necesita el backend en marcha, porque es una prueba de la ruta HTTP.
 */
console.log(String.fromCharCode(10) + '=== La respuesta dice en que consola se ejecuto');
const API = 'http://localhost:5174/api';
const backendVivo = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2000) })
  .then((r) => r.ok).catch(() => false);

if (!backendVivo) {
  console.log('  Sin backend en marcha: esta parte no se comprueba. Arranca "npm run dev" para incluirla.');
  fallos.push('el backend no estaba en marcha: la comprobacion de la ruta HTTP no se ejecuto');
} else {
  const pedir = async (ruta, init) => {
    const r = await fetch(API + ruta, { ...init, headers: { 'Content-Type': 'application/json' } });
    const t = await r.text();
    const d = t ? JSON.parse(t) : {};
    if (!r.ok) throw new Error(`${ruta} -> ${r.status} ${JSON.stringify(d).slice(0, 160)}`);
    return d;
  };

  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'codemind-ejec-http-'));
  await fs.writeFile(path.join(carpeta, 'marca.js'), 'console.log(\"MARCA-DE-LA-PRUEBA\");' + String.fromCharCode(10));
  const creado = await pedir('/projects', {
    method: 'POST',
    body: JSON.stringify({ name: `Ejecutar ${Date.now()}`, objective: 'prueba', root: carpeta }),
  });
  const pid = creado.project.id;

  try {
    const res = await pedir(`/projects/${pid}/ejecutar/archivo`, {
      method: 'POST',
      body: JSON.stringify({ path: 'marca.js' }),
    });
    comprobar(Boolean(res.sesion?.id), 'la respuesta no dice en que consola se ejecuto');

    // Y esa consola, justamente esa, tiene que acabar teniendo la salida.
    let visto = '';
    const limite = Date.now() + 25000;
    while (Date.now() < limite && !visto.includes('MARCA-DE-LA-PRUEBA')) {
      const lectura = await pedir(`/projects/${pid}/terminal/${res.sesion.id}?desde=0`);
      visto = lectura.trozos.map((t) => t.texto).join('');
      if (!visto.includes('MARCA-DE-LA-PRUEBA')) await new Promise((r) => setTimeout(r, 400));
    }
    console.log('  la consola devuelta contiene la salida: ' + (visto.includes('MARCA-DE-LA-PRUEBA') ? 'si' : 'NO'));
    comprobar(visto.includes('MARCA-DE-LA-PRUEBA'),
      'la consola que devuelve la respuesta no es donde se ejecuto: el panel se engancharia a la equivocada');
  } finally {
    await pedir(`/projects/${pid}`, { method: 'DELETE' }).catch(() => {});
    await fs.rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}

await fs.rm(temporal, { recursive: true, force: true });

console.log('\n=== Comprobaciones');
if (fallos.length) {
  for (const f of fallos) console.log('  FALLO:', f);
  process.exit(1);
}
console.log('  Todo correcto: deteccion, planes, nombres dificiles, limites y un comando ejecutado de verdad.');
