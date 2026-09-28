import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copia las gramaticas de tree-sitter a `web/public/gramaticas/`.
 *
 * Se copian en lugar de guardarse en el repositorio porque son binarios de
 * varios megabytes que no editamos nunca: viven en node_modules y este script
 * los deja donde el navegador puede pedirlos. Se ejecuta antes de arrancar y
 * antes de construir, asi que en la practica siempre estan.
 *
 * Solo se copian los lenguajes que el analizador sabe leer. Añadir uno aqui
 * sin añadir su descripcion en `web/src/lib/analyzer/treesitter.ts` no sirve
 * de nada: se cargaria una gramatica de la que no se extrae nada.
 */

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'web', 'public', 'gramaticas');

/**
 * Solo se copian los lenguajes que de verdad se pueden leer.
 *
 * Cada uno de estos se probo cargando su gramatica y mirando que nodos
 * produce, y tiene su descripcion en treesitter.ts. Quedan fuera dos que no
 * cargan con esta version del motor —Elm dice "Incompatible language version
 * 12" y el de YAML falla al inicializarse— y unos cuantos muy especializados
 * (QL, ReScript, Emacs Lisp, TLA+, SystemRDL) que pesarian sin que nadie los
 * fuera a usar aqui. Incluir una gramatica de la que no se extrae nada solo
 * hace el paquete mas grande.
 */
const LENGUAJES = [
  'python', 'java', 'c_sharp', 'go', 'php', 'ruby', 'rust',
  'c', 'cpp', 'bash', 'lua', 'kotlin', 'swift', 'dart',
  'scala', 'elixir', 'ocaml', 'objc', 'zig', 'solidity',
  // Configuracion y datos: no son lenguajes de programacion, pero un proyecto
  // se entiende tambien por como esta configurado.
  'json', 'toml',
];

/** Busca un archivo subiendo por las carpetas node_modules del monorepo. */
async function localizar(relativo) {
  const candidatos = [
    path.join(RAIZ, 'node_modules', relativo),
    path.join(RAIZ, 'web', 'node_modules', relativo),
  ];
  for (const candidato of candidatos) {
    if (await fs.access(candidato).then(() => true).catch(() => false)) return candidato;
  }
  return null;
}

async function copiar(origen, nombre) {
  const destino = path.join(DESTINO, nombre);
  const [nuevo, viejo] = await Promise.all([
    fs.stat(origen),
    fs.stat(destino).catch(() => null),
  ]);
  // Copiar 25 MB en cada arranque no tiene sentido si ya estan y no cambiaron.
  if (viejo && viejo.size === nuevo.size && viejo.mtimeMs >= nuevo.mtimeMs) return false;
  await fs.copyFile(origen, destino);
  return true;
}

async function main() {
  await fs.mkdir(DESTINO, { recursive: true });

  const nucleo = await localizar(path.join('web-tree-sitter', 'tree-sitter.wasm'));
  if (!nucleo) {
    console.error('No se encuentra web-tree-sitter. Ejecuta "npm install" antes.');
    process.exit(1);
  }

  let copiados = 0;
  let total = 0;
  if (await copiar(nucleo, 'tree-sitter.wasm')) copiados++;
  total += (await fs.stat(nucleo)).size;

  const faltan = [];
  for (const lenguaje of LENGUAJES) {
    const nombre = `tree-sitter-${lenguaje}.wasm`;
    const origen = await localizar(path.join('tree-sitter-wasms', 'out', nombre));
    if (!origen) {
      faltan.push(lenguaje);
      continue;
    }
    if (await copiar(origen, nombre)) copiados++;
    total += (await fs.stat(origen)).size;
  }

  if (faltan.length) {
    console.error(`Faltan gramaticas en tree-sitter-wasms: ${faltan.join(', ')}.`);
    process.exit(1);
  }

  const mb = (total / 1024 / 1024).toFixed(1);
  console.log(
    copiados
      ? `Gramaticas listas: ${LENGUAJES.length} lenguajes, ${mb} MB (${copiados} archivo(s) actualizado(s)).`
      : `Gramaticas listas: ${LENGUAJES.length} lenguajes, ${mb} MB (ya estaban al dia).`,
  );
}

await main();
