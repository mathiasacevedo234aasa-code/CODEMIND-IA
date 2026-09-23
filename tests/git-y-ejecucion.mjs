import fs from 'node:fs/promises';

const B = 'http://localhost:5174/api';
const DEMO = 'C:/Users/mathi/Desktop/codemind-demo-git';

const j = async (u, i) => {
  const r = await fetch(B + u, { ...i, headers: { 'Content-Type': 'application/json', ...(i?.headers ?? {}) } });
  const t = await r.text();
  let d;
  try { d = t ? JSON.parse(t) : {}; } catch { d = { raw: t }; }
  if (!r.ok) throw new Error(`${u} -> ${r.status} ${JSON.stringify(d).slice(0, 300)}`);
  return d;
};
const ok = (n, m = '') => console.log(`  OK  ${n}${m ? ' — ' + m : ''}`);

const { project } = await j('/projects', {
  method: 'POST',
  body: JSON.stringify({ name: 'Demo Git', objective: 'Probar la integracion real con git.', root: DEMO }),
});
ok('Proyecto sobre carpeta real del disco', `${project.mode} -> ${project.root}`);

const t = await j(`/projects/${project.id}/tree`);
ok('Arbol leido de la carpeta del usuario', t.tree.map((n) => n.name).join(', '));

let st = await j(`/projects/${project.id}/git/status`);
ok('Estado git inicial', `available=${st.available} isRepo=${st.isRepo}`);
if (st.isRepo) throw new Error('No deberia ser repo aun');

await j(`/projects/${project.id}/git/init`, { method: 'POST' });
st = await j(`/projects/${project.id}/git/status`);
ok('Repositorio inicializado', `rama=${st.branch} sin seguimiento=${st.untracked.length}`);
console.log('    clasificacion:', st.untracked.map((u) => `${u.path}[${u.kind}]`).join(' '));
if (!st.untracked.some((u) => u.path === 'README.md' && u.kind === 'documentacion')) throw new Error('README mal clasificado');
if (!st.untracked.some((u) => u.path === 'js/app.js' && u.kind === 'codigo')) throw new Error('app.js mal clasificado');

await j(`/projects/${project.id}/git/stage`, { method: 'POST', body: JSON.stringify({ paths: ['index.html', 'js/app.js', 'README.md'] }) });
st = await j(`/projects/${project.id}/git/status`);
ok('Archivos preparados', `${st.staged.length} preparados, ${st.untracked.length} sin seguimiento`);

const d = await j(`/projects/${project.id}/git/diff?path=${encodeURIComponent('js/app.js')}&staged=1`);
ok('Diff de un archivo preparado', `${d.diff.split('\n').length} lineas, binario=${d.binary}`);

const c = await j(`/projects/${project.id}/git/commit`, { method: 'POST', body: JSON.stringify({ message: 'Primer commit desde CodeMind AI' }) });
ok('Commit creado', `${c.commit.short} ${c.commit.subject}`);

const lg = await j(`/projects/${project.id}/git/log`);
ok('Historial', `${lg.commits.length} commit(s), autor ${lg.commits[0].author}`);

const br = await j(`/projects/${project.id}/git/branches`);
ok('Ramas', `actual=${br.current} locales=${br.local.join(',')}`);

// Renombrado + nombre con espacios: comprueba el parseo del formato -z
await fs.rename(`${DEMO}/js/app.js`, `${DEMO}/js/saludos.js`);
await fs.writeFile(`${DEMO}/nombre con espacios.txt`, 'prueba\n');
await j(`/projects/${project.id}/git/stage`, { method: 'POST', body: JSON.stringify({ paths: ['.'] }) });
st = await j(`/projects/${project.id}/git/status`);
const ren = st.staged.find((s) => s.code.startsWith('R'));
ok('Renombrado detectado', ren ? `${ren.renamedFrom} -> ${ren.path}` : '(git lo vio como alta + baja)');
console.log('    preparados:', st.staged.map((s) => s.path).join(' | '));
if (!st.staged.some((s) => s.path === 'nombre con espacios.txt')) throw new Error('Ruta con espacios mal parseada');

// Cambio de rama con cambios pendientes: debe negarse, no descartar trabajo
try {
  await j(`/projects/${project.id}/git/checkout`, { method: 'POST', body: JSON.stringify({ branch: 'otra', create: true }) });
  throw new Error('Deberia haberse negado');
} catch (e) {
  if (!e.message.includes('409')) throw e;
  ok('Cambio de rama bloqueado con cambios sin confirmar');
}

// GitHub sin token: honesto, sin inventar
const gh = await j('/github/status');
ok('GitHub sin token', `configured=${gh.configured}`);
const pv = await j(`/projects/${project.id}/github/preview`);
ok('Vista previa de sincronizacion', `vinculado=${pv.linked} canPush=${pv.canPush}`);
console.log('    avisos:', pv.warnings.join(' | '));

// Ejecucion
const sc = await j(`/projects/${project.id}/run/scripts`);
ok('Scripts detectados', `hasPackageJson=${sc.hasPackageJson}`);
console.log('    notas:', sc.notes.join(' | '));
try {
  await j(`/projects/${project.id}/run/start`, { method: 'POST', body: JSON.stringify({ script: 'rm -rf /' }) });
  throw new Error('Deberia rechazar un script inexistente');
} catch (e) {
  if (!e.message.includes('400')) throw e;
  ok('Se rechaza ejecutar un comando que no esta en package.json');
}

// Sondeo de URL
const probe = await j(`/net/probe?url=${encodeURIComponent('http://localhost:5174/api/health')}`);
ok('Sondeo de URL viva', `reachable=${probe.reachable} embeddable=${probe.embeddable}`);
const probe2 = await j(`/net/probe?url=${encodeURIComponent('http://localhost:59999')}`);
ok('Sondeo de puerto cerrado', `reachable=${probe2.reachable} motivo="${(probe2.reason || '').slice(0, 55)}"`);

// La carpeta del usuario NO se borra al eliminar el proyecto
await j(`/projects/${project.id}`, { method: 'DELETE' });
const sigue = await fs.stat(DEMO).then(() => true).catch(() => false);
if (!sigue) throw new Error('GRAVE: se borro la carpeta real del usuario');
ok('Al eliminar el proyecto, la carpeta del usuario sigue intacta');

console.log('\nTodas las comprobaciones de la fase 5 y 6 (backend) pasaron.');
