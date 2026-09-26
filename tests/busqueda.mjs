const B = 'http://localhost:5174/api';
const j = async (u, i) => {
  const r = await fetch(B + u, { ...i, headers: { 'Content-Type': 'application/json', ...(i?.headers ?? {}) } });
  const t = await r.text();
  const d = t ? JSON.parse(t) : {};
  if (!r.ok) throw new Error(`${u} -> ${r.status} ${JSON.stringify(d).slice(0, 200)}`);
  return d;
};
const ok = (n, m = '') => console.log(`  OK  ${n}${m ? ' — ' + m : ''}`);

const { projects } = await j('/projects');
if (!projects.length) throw new Error('No hay ningun proyecto con el que probar.');
const id = projects[0].id;

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

console.log('\nTodas las comprobaciones de busqueda y exportacion pasaron.');
