const BASE = 'http://localhost:5174/api';
const j = async (url, init) => {
  const res = await fetch(BASE + url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${JSON.stringify(data).slice(0, 400)}`);
  return data;
};
const ok = (n, m = '') => console.log(`  OK  ${n}${m ? ' — ' + m : ''}`);

// Prueba 1: crear proyecto, archivos y codigo
const { project } = await j('/projects', {
  method: 'POST',
  body: JSON.stringify({ name: 'Tienda demo', objective: 'Carrito de compras para practicar logica de programacion.' }),
});
ok('Prueba 1a: proyecto creado', project.id);

const carrito = `const IVA = 0.19;

/**
 * Suma los productos del carrito.
 */
function calcularTotal(productos, conImpuesto) {
  let total = 0;
  for (const producto of productos) {
    total += producto.precio * producto.cantidad;
  }
  if (conImpuesto) {
    total = total * (1 + IVA);
  }
  return total;
}

const formatearPrecio = (valor) => \`$\${valor.toFixed(2)}\`;

class Carrito {
  constructor() { this.items = []; }
  agregar(item) { this.items.push(item); return this.items.length; }
  async sincronizar() { return fetch('/api/carrito'); }
}
`;

await j(`/projects/${project.id}/file`, { method: 'PUT', body: JSON.stringify({ path: 'index.html', content: '<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><title>Tienda</title><link rel="stylesheet" href="css/styles.css"></head>\n<body><h1>Tienda demo</h1><script src="js/carrito.js"></script></body></html>' }) });
await j(`/projects/${project.id}/file`, { method: 'PUT', body: JSON.stringify({ path: 'css/styles.css', content: 'body { font-family: sans-serif; }' }) });
await j(`/projects/${project.id}/file`, { method: 'PUT', body: JSON.stringify({ path: 'js/carrito.js', content: carrito }) });
const { tree } = await j(`/projects/${project.id}/tree`);
ok('Prueba 1b: HTML/CSS/JS guardados', JSON.stringify(tree.map((n) => n.name)));

// Prueba 2: deteccion de funciones (analizador del frontend, probado aparte)
const { analyzeFile } = await import('file:///C:/Users/mathi/Desktop/codemind-ai/web/src/lib/analyzer.ts');
const analysis = analyzeFile('js/carrito.js', carrito);
console.log('  Funciones detectadas:', analysis.functions.map((f) => `${f.qualifiedName}@${f.line}`).join(', '));
if (analysis.functions.length < 5) throw new Error('Se esperaban al menos 5 funciones');
ok('Prueba 2: deteccion de funciones');

const fn = analysis.functions.find((f) => f.name === 'calcularTotal');

// Prueba 3: documentar una funcion con Groq
const doc = await j('/ai/document', {
  method: 'POST',
  body: JSON.stringify({
    projectId: project.id,
    code: fn.code,
    context: { functionId: fn.id, filePath: fn.filePath, language: 'javascript', lineStart: fn.line, relatedFunctions: ['formatearPrecio'] },
  }),
});
if (!doc.ok) throw new Error('Respuesta invalida: ' + JSON.stringify(doc.problems));
ok('Prueba 3: propuesta generada', `modelo ${doc.model}, proposito: "${doc.doc.proposito.slice(0, 70)}..."`);
console.log('    parametros:', doc.doc.parametros.map((p) => p.nombre).join(', '));
console.log('    flujo:', doc.doc.flujo.length, 'pasos; dependencias:', doc.doc.dependencias.map((d) => d.nombre).join(', '));

// El codigo original no fue tocado
const after = await j(`/projects/${project.id}/file?path=js/carrito.js`);
if (after.content !== carrito) throw new Error('El codigo fuente fue modificado');
ok('Prueba 3b: el codigo original no se modifico');

const { proposal } = await j(`/projects/${project.id}/proposals`, {
  method: 'POST',
  body: JSON.stringify({ functionId: fn.id, name: fn.name, filePath: fn.filePath, codeHash: fn.codeHash, code: fn.code, doc: doc.doc, model: doc.model }),
});
const pendientes = await j(`/projects/${project.id}/docs`);
if (Object.keys(pendientes.approved).length !== 0) throw new Error('Una propuesta llego a la documentacion oficial sin aprobacion');
ok('Prueba 3c: la propuesta queda pendiente, separada de lo aprobado');

// Prueba 4: aprobar
await j(`/projects/${project.id}/proposals/${proposal.id}/approve`, { method: 'POST' });
const trasAprobar = await j(`/projects/${project.id}/docs`);
if (!trasAprobar.approved[fn.id]) throw new Error('No se guardo la documentacion aprobada');
if (trasAprobar.proposals.length !== 0) throw new Error('La propuesta sigue pendiente');
ok('Prueba 4: documentacion aprobada y guardada');

// Prueba 5: rechazar una propuesta
const fn2 = analysis.functions.find((f) => f.name === 'formatearPrecio');
const doc2 = await j('/ai/document', { method: 'POST', body: JSON.stringify({ projectId: project.id, code: fn2.code, context: { filePath: fn2.filePath } }) });
const { proposal: p2 } = await j(`/projects/${project.id}/proposals`, { method: 'POST', body: JSON.stringify({ functionId: fn2.id, name: fn2.name, filePath: fn2.filePath, codeHash: fn2.codeHash, code: fn2.code, doc: doc2.doc }) });
await j(`/projects/${project.id}/proposals/${p2.id}`, { method: 'DELETE' });
const trasDescartar = await j(`/projects/${project.id}/docs`);
if (trasDescartar.approved[fn2.id]) throw new Error('Una propuesta descartada acabo en la documentacion oficial');
ok('Prueba 5: propuesta descartada sin efecto en lo oficial');

// Prueba 6: modificar la funcion -> documentacion marcada para revision
const modificado = carrito.replace('let total = 0;', 'let total = 0; // acumulador');
await j(`/projects/${project.id}/file`, { method: 'PUT', body: JSON.stringify({ path: 'js/carrito.js', content: modificado }) });
const analysis2 = analyzeFile('js/carrito.js', modificado);
const fnMod = analysis2.functions.find((f) => f.name === 'calcularTotal');
const docs2 = await j(`/projects/${project.id}/docs`);
const estado = docs2.approved[fnMod.id].codeHash === fnMod.codeHash ? 'documentada' : 'revisar';
if (estado !== 'revisar') throw new Error('El cambio no se detecto');
const otra = analysis2.functions.find((f) => f.name === 'agregar');
if (docs2.approved[otra.id]) throw new Error('Se marcaron funciones no relacionadas');
ok('Prueba 6: cambio detectado solo en la funcion afectada', `estado = ${estado}`);

// Prueba 7: consultar el contexto del proyecto
await j(`/projects/${project.id}/memory`, {
  method: 'PUT',
  body: JSON.stringify({ memory: { overview: { objective: 'Carrito de compras educativo', technologies: 'HTML, CSS, JavaScript', pending: 'Pasarela de pago' } } }),
});
const respuesta = await j('/ai/chat', {
  method: 'POST',
  body: JSON.stringify({ projectId: project.id, mode: 'context', question: 'Que estoy construyendo en este proyecto y que me falta?' }),
});
ok('Prueba 7: respuesta de contexto', respuesta.answer.replace(/\s+/g, ' ').slice(0, 130) + '...');

// Prueba 11: la clave no se filtra por la API
const settings = await j('/settings');
const plano = JSON.stringify(settings);
if (plano.includes('gsk_')) throw new Error('La API key se filtro en /api/settings');
const health = JSON.stringify(await j('/health'));
if (health.includes('gsk_')) throw new Error('La API key se filtro en /api/health');
ok('Prueba 11: la API key no aparece en ninguna respuesta');

// Historial
const hist = await j(`/projects/${project.id}/history`);
ok('Historial disponible', `${hist.versions.length} version(es) previas`);

console.log('\nProyecto de prueba:', project.id);
