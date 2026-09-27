
const B = 'http://localhost:5174/api';
const j = async (u, i) => {
  const r = await fetch(B + u, { ...i, headers: { 'Content-Type': 'application/json', ...(i?.headers ?? {}) } });
  const t = await r.text();
  const d = t ? JSON.parse(t) : {};
  if (!r.ok) throw new Error(`${u} -> ${r.status} ${JSON.stringify(d).slice(0, 200)}`);
  return d;
};
const ok = (n, m = '') => console.log(`  OK  ${n}${m ? ' — ' + m : ''}`);

/**
 * La prueba se crea su propio proyecto.
 *
 * Antes usaba el primero de la lista, y eso la hacia depender de lo que
 * hubiera en el equipo: si ese proyecto no contenia la palabra buscada, la
 * prueba fallaba por algo que no tiene nada que ver con la busqueda. Con su
 * propio contenido, lo que comprueba es la busqueda y nada mas.
 */
const fs = await import('node:fs/promises');
const os = await import('node:os');
const path = await import('node:path');

const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'codemind-busqueda-'));
await fs.mkdir(path.join(carpeta, 'src'), { recursive: true });
const NL = String.fromCharCode(10);
await fs.writeFile(path.join(carpeta, 'src', 'uno.js'), [
  'function calcular(a, b) { return a + b; }',
  'const TOTAL = 10;',
  '// FUNCTION en mayusculas dentro de un comentario',
].join(NL));
await fs.writeFile(path.join(carpeta, 'src', 'dos.ts'), [
  'export function sumar(x: number) { return x; }',
  'const limite = 5;',
].join(NL));
await fs.writeFile(path.join(carpeta, 'notas.md'), ['# Notas', 'Aqui no hay ninguna funcion.'].join(NL));

const creado = await j('/projects', {
  method: 'POST',
  body: JSON.stringify({ name: `Busqueda ${Date.now()}`, objective: 'Proyecto de prueba', root: carpeta }),
});
const id = creado.project.id;

/**
 * Se borra al terminar. No vale engancharlo a `process.on('exit')`: ahi ya no
 * se puede esperar a nada asincrono y el proyecto de prueba se quedaba en la
 * lista del usuario. Se llama explicitamente al final y tambien si algo falla.
 */
const limpiar = async () => {
  await j(`/projects/${id}`, { method: 'DELETE' }).catch(() => {});
  await fs.rm(carpeta, { recursive: true, force: true }).catch(() => {});
};

// Si algo falla por el camino, tampoco se queda el proyecto suelto.
process.on('uncaughtException', async (e) => { await limpiar(); console.error(e.message); process.exit(1); });

const res = await j(`/projects/${id}/search`, { method: 'POST', body: JSON.stringify({ query: 'function' }) });
ok('Busqueda simple', `${res.totalMatches} coincidencia(s) en ${res.totalFiles} archivo(s)`);

const sensible = await j(`/projects/${id}/search`, { method: 'POST', body: JSON.stringify({ query: 'FUNCTION', caseSensitive: true }) });
if (sensible.totalMatches >= res.totalMatches) throw new Error('caseSensitive no filtra');
ok('Distinguir mayusculas', `${sensible.totalMatches} frente a ${res.totalMatches}`);

const regex = await j(`/projects/${id}/search`, { method: 'POST', body: JSON.stringify({ query: 'const\s+\w+', regex: true }) });
ok('Expresion regular', `${regex.totalMatches} coincidencia(s)`);

try {
  await j(`/projects/${id}/search`, { method: 'POST', body: JSON.stringify({ query: '[sin cerrar', regex: true }) });
  throw new Error('Deberia rechazar una regex invalida');
} catch (e) {
  if (!e.message.includes('400')) throw e;
  ok('Se rechaza una expresion regular invalida');
}

const filtrado = await j(`/projects/${id}/search`, { method: 'POST', body: JSON.stringify({ query: 'function', include: '*.js' }) });
if (filtrado.files.some((f) => !f.path.endsWith('.js'))) throw new Error('El filtro include no se respeta');
ok('Filtro por tipo de archivo', `${filtrado.totalFiles} archivo(s) .js`);

// Lo critico: la vista previa NO puede tocar el disco
const objetivo = res.files[0]?.path;
if (objetivo) {
  const antes = (await j(`/projects/${id}/file?path=${encodeURIComponent(objetivo)}`)).content;
  const previa = await j(`/projects/${id}/replace/preview`, {
    method: 'POST',
    body: JSON.stringify({ query: 'function', replacement: 'FUNCION_CAMBIADA' }),
  });
  const despues = (await j(`/projects/${id}/file?path=${encodeURIComponent(objetivo)}`)).content;
  if (antes !== despues) throw new Error('GRAVE: la vista previa modifico el archivo');
  if (previa.applied !== false) throw new Error('La vista previa se marco como aplicada');
  ok('La vista previa del reemplazo no escribe nada', `${previa.totalReplacements} sustitucion(es) calculada(s)`);
}

const exportado = await j(`/projects/${id}/docs/export?format=md`);
if (!exportado.content.startsWith('#')) throw new Error('El Markdown exportado no empieza por un titulo');
ok('Exportar documentacion', `${exportado.filename}, ${exportado.documented} elemento(s)`);

const html = await j(`/projects/${id}/docs/export?format=html`);
if (!html.content.startsWith('<!doctype html>')) throw new Error('El HTML exportado no es una pagina valida');
ok('Exportar en HTML', `${html.content.length} caracteres`);

await limpiar();
console.log('\nTodas las comprobaciones de busqueda y exportacion pasaron.');
