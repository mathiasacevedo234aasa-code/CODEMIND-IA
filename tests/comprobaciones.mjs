import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quality = await import(pathToFileURL(path.join(raiz, 'server/src/services/quality.js')).href);
const { clasificar, leerTsc, leerEslint, leerPruebas, resumenPruebas } = quality._internos;

const fallos = [];
const comprobar = (condicion, texto) => { if (!condicion) fallos.push(texto); };
const cwd = process.platform === 'win32' ? 'C:\\proy' : '/proy';

// ------------------------------------------------------- clasificacion
console.log('=== Clasificacion de scripts');
const casos = [
  ['test', 'vitest run', 'pruebas'],
  ['test:unit', 'jest', 'pruebas'],
  ['typecheck', 'tsc --noEmit', 'tipos'],
  ['lint', 'eslint .', 'estilo'],
  ['comprobar', 'tsc --noEmit -p tsconfig.json', 'tipos'],   // por el comando
  ['build', 'tsc && vite build', null],                       // construir no es comprobar
  ['dev', 'vite', null],
  ['start', 'node server.js', null],
];
for (const [nombre, comando, esperado] of casos) {
  const real = clasificar(nombre, comando);
  console.log(`  ${nombre.padEnd(12)} ${String(real)}`);
  comprobar(real === esperado, `"${nombre}" se clasifico como ${real} y deberia ser ${esperado}`);
}

// ------------------------------------------------------- TypeScript
console.log('\n=== Salida de tsc');
const tsc = [
  'src/lib/suma.ts(12,5): error TS2345: Argument of type "string" is not assignable to parameter of type "number".',
  'src/app.tsx(3,1): warning TS6133: "React" is declared but its value is never read.',
  `${cwd}${path.sep}src${path.sep}otro.ts(7,2): error TS2304: Cannot find name "foo".`,
  '..' + path.sep + 'fuera' + path.sep + 'x.ts(1,1): error TS1005: fuera del proyecto',
  'Found 3 errors.',
].join('\n');
const avisosTsc = leerTsc(cwd, tsc);
for (const a of avisosTsc) console.log(`  ${a.nivel} ${a.archivo}:${a.linea}:${a.columna} [${a.regla}] ${a.mensaje.slice(0, 40)}`);
comprobar(avisosTsc.length === 3, `tsc: se esperaban 3 avisos dentro del proyecto, hubo ${avisosTsc.length}`);
comprobar(avisosTsc[0].archivo === 'src/lib/suma.ts' && avisosTsc[0].linea === 12 && avisosTsc[0].columna === 5, 'tsc: mal la posicion');
comprobar(avisosTsc[1].nivel === 'aviso', 'tsc: un warning deberia ser aviso, no error');
comprobar(avisosTsc[2].archivo === 'src/otro.ts', 'tsc: no convirtio la ruta absoluta en relativa');
comprobar(!avisosTsc.some((a) => a.archivo.includes('fuera')), 'tsc: dejo pasar un archivo de fuera del proyecto');

// ------------------------------------------------------- ESLint
console.log('\n=== Salida de eslint');
const eslint = [
  '',
  'src/componentes/Boton.tsx',
  '   4:11  error    "props" is defined but never used     @typescript-eslint/no-unused-vars',
  '  19:3   warning  Unexpected console statement          no-console',
  '',
  'src/util.js',
  '   1:1   error    Parsing error: cosa rara',
  '',
  '2 problems (1 error, 1 warning)',
].join('\n');
const avisosLint = leerEslint(cwd, eslint);
for (const a of avisosLint) console.log(`  ${a.nivel} ${a.archivo}:${a.linea}:${a.columna} [${a.regla}] ${a.mensaje}`);
comprobar(avisosLint.length === 3, `eslint: se esperaban 3 avisos, hubo ${avisosLint.length}`);
comprobar(avisosLint[0].archivo === 'src/componentes/Boton.tsx', 'eslint: no asocio el aviso con su archivo');
comprobar(avisosLint[0].regla === '@typescript-eslint/no-unused-vars', 'eslint: perdio el nombre de la regla');
comprobar(avisosLint[1].nivel === 'aviso' && avisosLint[1].linea === 19, 'eslint: mal el warning');
comprobar(avisosLint[2].archivo === 'src/util.js', 'eslint: no cambio de archivo al llegar la segunda ruta');

// ------------------------------------------------------- pruebas
console.log('\n=== Salida de pruebas');
const pruebas = [
  ' \u2713 src/suma.test.ts (3 tests) 5ms',
  ' FAIL  src/resta.test.ts > resta > devuelve la diferencia',
  '   AssertionError: expected 1 to be 2',
  '    at src/resta.test.ts:14:22',
  '    at node_modules/vitest/dist/chunk.js:1:1',
  '',
  ' Tests  1 failed | 3 passed (4)',
].join('\n');
const avisosPruebas = leerPruebas(cwd, pruebas);
for (const a of avisosPruebas) console.log(`  ${a.archivo}:${a.linea} ${a.mensaje}`);
comprobar(avisosPruebas.length === 1, `pruebas: se esperaba 1 fallo, hubo ${avisosPruebas.length}`);
comprobar(avisosPruebas[0]?.archivo === 'src/resta.test.ts' && avisosPruebas[0]?.linea === 14,
  'pruebas: no situo el fallo en la linea de la pila');

const resumen = resumenPruebas(pruebas);
console.log(`  resumen: ${resumen?.superadas} superadas, ${resumen?.fallidas} fallidas`);
comprobar(resumen?.fallidas === 1 && resumen?.superadas === 3, 'pruebas: mal el recuento de vitest');

// El corredor propio de Node: otros simbolos y las rutas como URL file://.
const nodeTest = [
  '✔ la suma funciona (1.1ms)',
  '✖ la resta falla a proposito (0.9ms)',
  'ℹ pass 1',
  'ℹ fail 1',
  '',
  '✖ failing tests:',
  '',
  '✖ la resta falla a proposito (0.9ms)',
  '  AssertionError [ERR_ASSERTION]: 2 == 99',
  `      at TestContext.<anonymous> (${pathToFileURL(path.join(cwd, 'src', 'casos.test.js')).href}:9:10)`,
  '      at Test.run (node:internal/test_runner/test:1382:25)',
].join('\n');
const avisosNode = leerPruebas(cwd, nodeTest);
for (const a of avisosNode) console.log(`  ${a.archivo}:${a.linea} ${a.mensaje}`);
comprobar(avisosNode.length === 1, `node --test: se esperaba 1 fallo tras quitar repetidos, hubo ${avisosNode.length}`);
comprobar(avisosNode[0]?.archivo === 'src/casos.test.js' && avisosNode[0]?.linea === 9,
  'node --test: no supo leer la ruta file:// de la pila');
const resNode = resumenPruebas(nodeTest);
comprobar(resNode?.fallidas === 1 && resNode?.superadas === 1, 'node --test: mal el recuento');

const jest = 'Tests:       2 failed, 1 skipped, 7 passed, 10 total';
comprobar(resumenPruebas(jest)?.fallidas === 2 && resumenPruebas(jest)?.superadas === 7, 'pruebas: mal el recuento de jest');
comprobar(resumenPruebas('todo bien por aqui') === null, 'pruebas: invento un recuento donde no lo habia');

// ------------------------------------- de verdad: un proyecto que falla
console.log('\n=== Ejecucion real');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'codemind-checks-'));
await fs.writeFile(path.join(temp, 'package.json'), JSON.stringify({
  name: 'proyecto-de-prueba',
  scripts: {
    test: 'node pruebas.js',
    build: 'node -e "0"',
  },
}, null, 2));
await fs.writeFile(path.join(temp, 'pruebas.js'),
  'console.log("FAIL casos.test.js > suma");\nconsole.log("    at casos.test.js:9:3");\nprocess.exit(1);\n');

const detectadas = await quality.tareas(temp);
console.log('  tareas detectadas: ' + detectadas.tareas.map((t) => `${t.id} (${t.clase})`).join(', '));
comprobar(detectadas.tareas.length === 1 && detectadas.tareas[0].id === 'test',
  'no detecto exactamente la tarea de pruebas (build no debe aparecer)');

const resultado = await quality.ejecutar(temp, 'test');
console.log(`  ${resultado.comando} -> codigo ${resultado.exitCode}, ${resultado.avisos.length} aviso(s)`);
for (const a of resultado.avisos) console.log(`    ${a.archivo}:${a.linea} ${a.mensaje}`);
comprobar(resultado.correcto === false, 'una tarea que devuelve 1 se dio por correcta');
comprobar(resultado.avisos.length === 1 && resultado.avisos[0].archivo === 'casos.test.js',
  'no situo el fallo de la ejecucion real');
comprobar(resultado.sinLeer === false, 'dijo que no supo leer la salida cuando si encontro el fallo');

// Un script que no es una comprobacion no se puede ejecutar por esta via.
let rechazado = false;
try { await quality.ejecutar(temp, 'build'); } catch (err) { rechazado = err.status === 400; }
comprobar(rechazado, 'dejo ejecutar "build", que no es una comprobacion');

let inventado = false;
try { await quality.ejecutar(temp, 'rm -rf /'); } catch (err) { inventado = err.status === 400; }
comprobar(inventado, 'no rechazo un script que no existe en el package.json');

await fs.rm(temp, { recursive: true, force: true });

console.log('\n=== Comprobaciones');
if (fallos.length) {
  for (const f of fallos) console.log('  FALLO:', f);
  process.exit(1);
}
console.log('  Todo correcto: clasificacion, tsc, eslint, pruebas y ejecucion real.');
