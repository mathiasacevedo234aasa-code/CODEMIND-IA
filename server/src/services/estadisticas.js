import fs from 'node:fs/promises';
import path from 'node:path';
import { run } from './git.js';
import { readDocs } from './store.js';

/**
 * El "informe del semestre" del proyecto: todo sale de hechos (el disco, el
 * historial de git y la documentación aprobada), sin IA.
 */

const IGNORAR = new Set(['node_modules', '.git', 'dist', 'build', 'release', '.next', 'coverage', '__pycache__', '.venv', 'venv']);
const BINARIOS = /\.(png|jpe?g|gif|webp|ico|bmp|avif|pdf|zip|gz|rar|7z|exe|dll|so|dylib|woff2?|ttf|otf|mp[34]|webm|wav|ogg|wasm|class|jar|lock)$/i;

async function recorrer(raiz, rel = '', salida = []) {
  if (salida.length > 20000) return salida;
  for (const e of await fs.readdir(path.join(raiz, rel), { withFileTypes: true }).catch(() => [])) {
    if (IGNORAR.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await recorrer(raiz, r, salida);
    else if (e.isFile()) salida.push(r);
  }
  return salida;
}

export async function estadisticas(projectId, raiz) {
  const archivos = await recorrer(raiz);
  const porLenguaje = {};
  const tamanos = [];
  let lineasTotales = 0;
  for (const rel of archivos) {
    const stat = await fs.stat(path.join(raiz, rel)).catch(() => null);
    if (!stat) continue;
    tamanos.push({ ruta: rel, bytes: stat.size });
    const ext = (path.extname(rel).slice(1) || path.basename(rel)).toLowerCase();
    const l = porLenguaje[ext] ?? { archivos: 0, lineas: 0, bytes: 0 };
    l.archivos++;
    l.bytes += stat.size;
    if (!BINARIOS.test(rel) && stat.size < 2 * 1024 * 1024) {
      const texto = await fs.readFile(path.join(raiz, rel), 'utf8').catch(() => '');
      const n = texto ? texto.split('\n').length : 0;
      l.lineas += n;
      lineasTotales += n;
    }
    porLenguaje[ext] = l;
  }

  // Git, los últimos seis meses: commits por mes, autores y archivos más tocados.
  let git = null;
  const log = await run(raiz, ['log', '--since=6.months', '--name-only', '--format=%x1e%ad%x1f%an', '--date=short'], { allowFailure: true }).catch(() => null);
  if (log && log.code === 0) {
    const porMes = {};
    const autores = {};
    const cambios = {};
    let commits = 0;
    for (const bloque of log.stdout.split(String.fromCharCode(30)).filter((b) => b.trim())) {
      const [cab, ...resto] = bloque.split(/\r?\n/);
      const [fecha, autor] = cab.split(String.fromCharCode(31));
      commits++;
      porMes[fecha.slice(0, 7)] = (porMes[fecha.slice(0, 7)] ?? 0) + 1;
      autores[autor] = (autores[autor] ?? 0) + 1;
      for (const f of resto.map((x) => x.trim()).filter(Boolean)) cambios[f] = (cambios[f] ?? 0) + 1;
    }
    git = {
      commits,
      porMes,
      autores: Object.entries(autores).sort((a, b) => b[1] - a[1]).map(([nombre, n]) => ({ nombre, commits: n })),
      masModificados: Object.entries(cambios).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ruta, veces]) => ({ ruta, veces })),
    };
  }

  // Documentación aprobada, por mes.
  const docs = await readDocs(projectId);
  const docPorMes = {};
  for (const d of Object.values(docs.approved)) {
    const mes = String(d.approvedAt ?? '').slice(0, 7);
    if (mes) docPorMes[mes] = (docPorMes[mes] ?? 0) + 1;
  }

  return {
    archivos: archivos.length,
    lineas: lineasTotales,
    porLenguaje: Object.entries(porLenguaje).sort((a, b) => b[1].lineas - a[1].lineas).slice(0, 15).map(([ext, v]) => ({ ext, ...v })),
    masGrandes: tamanos.sort((a, b) => b.bytes - a.bytes).slice(0, 10),
    git,
    documentacion: { aprobadas: Object.keys(docs.approved).length, porMes: docPorMes },
  };
}
