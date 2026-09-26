import type { DetectedSymbol } from '../types.ts';
import { analizarJs } from './js.ts';
import { analizarHtml } from './html.ts';
import { analizarCss, importacionesCss } from './css.ts';
import { analizarMarkdown } from './markdown.ts';

/**
 * Punto de entrada del análisis.
 *
 * Decide qué analizador aplica según la extensión y, cuando un archivo
 * contiene varios lenguajes (una página HTML con `<script>` y `<style>`),
 * ejecuta cada uno sobre su trozo y corrige la numeración de líneas para que
 * saltar al código siga llevando al sitio correcto.
 */

const SOPORTADOS = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts',
  'html', 'htm', 'vue', 'svelte', 'astro',
  'css', 'scss', 'less',
  'md', 'mdx',
]);

export function extensionOf(path: string): string {
  const i = path.lastIndexOf('.');
  return i === -1 ? '' : path.slice(i + 1).toLowerCase();
}

export function languageOf(path: string): string {
  const ext = extensionOf(path);
  const map: Record<string, string> = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', md: 'markdown', mdx: 'markdown', vue: 'html', svelte: 'html',
    astro: 'html', svg: 'xml', yml: 'yaml', yaml: 'yaml', py: 'python', java: 'java',
  };
  return map[ext] ?? 'plaintext';
}

export const isAnalyzable = (path: string) => SOPORTADOS.has(extensionOf(path));

/** Hash estable y barato (FNV-1a) del contenido normalizado. */
export function hashCode(code: string): string {
  const normalized = code.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + normalized.length.toString(16);
}

export interface FileAnalysis {
  symbols: DetectedSymbol[];
  /** Especificadores tal y como aparecen en el codigo, sin resolver. */
  imports: string[];
  classes: string[];
  error: string | null;
}

const EMPTY: FileAnalysis = { symbols: [], imports: [], classes: [], error: null };

/** Último análisis válido por archivo, para tolerar código a medio escribir. */
const lastGood = new Map<string, FileAnalysis>();

/** Reparte los símbolos de un bloque incrustado en su lenguaje. */
function analizarBloques(filePath: string, bloques: ReturnType<typeof analizarHtml>['bloques']) {
  const simbolos: DetectedSymbol[] = [];
  const imports: string[] = [];
  const classes: string[] = [];
  let error: string | null = null;

  for (const bloque of bloques) {
    if (bloque.tipo === 'script') {
      const res = analizarJs(filePath, bloque.codigo, {
        offsetLineas: bloque.offset,
        lenguaje: bloque.lenguaje,
      });
      simbolos.push(...res.simbolos);
      imports.push(...res.imports);
      classes.push(...res.classes);
      if (res.error && !error) error = res.error;
    } else {
      simbolos.push(...analizarCss(filePath, bloque.codigo, bloque.offset));
    }
  }
  return { simbolos, imports, classes, error };
}

export function analyzeFile(filePath: string, source: string): FileAnalysis {
  if (!isAnalyzable(filePath)) return EMPTY;
  const ext = extensionOf(filePath);

  let resultado: FileAnalysis;

  if (ext === 'html' || ext === 'htm' || ext === 'vue' || ext === 'svelte' || ext === 'astro') {
    // Una página es varios lenguajes a la vez: estructura, script y estilo.
    const { simbolos, bloques, dependencias } = analizarHtml(filePath, source);
    const incrustados = analizarBloques(filePath, bloques);
    resultado = {
      symbols: [...simbolos, ...incrustados.simbolos],
      // Los <script src> y <link href> de la pagina cuentan como dependencias
      // igual que un import: son las aristas que unen los archivos.
      imports: [...incrustados.imports, ...dependencias],
      classes: incrustados.classes,
      error: incrustados.error,
    };
  } else if (ext === 'css' || ext === 'scss' || ext === 'less') {
    resultado = { symbols: analizarCss(filePath, source), imports: importacionesCss(source), classes: [], error: null };
  } else if (ext === 'md' || ext === 'mdx') {
    resultado = { symbols: analizarMarkdown(filePath, source), imports: [], classes: [], error: null };
  } else {
    const res = analizarJs(filePath, source, { lenguaje: languageOf(filePath) });
    resultado = { symbols: res.simbolos, imports: res.imports, classes: res.classes, error: res.error };
  }

  // Código incompleto: se conserva lo último que sí se pudo analizar, para no
  // vaciar el panel mientras se escribe.
  if (resultado.error && !resultado.symbols.length) {
    const previo = lastGood.get(filePath);
    if (previo) return { ...previo, error: resultado.error };
  }

  // La huella se calcula aquí, una sola vez, sobre el código ya extraído.
  for (const simbolo of resultado.symbols) simbolo.codeHash = hashCode(simbolo.code);

  resultado.symbols.sort((a, b) => a.line - b.line);
  if (!resultado.error) lastGood.set(filePath, resultado);
  return resultado;
}

export function forgetFile(filePath: string) {
  lastGood.delete(filePath);
}

/**
 * Propone reasignar la documentación cuando un elemento se renombra o se
 * mueve: si el código es idéntico y el identificador antiguo ya no existe,
 * seguramente sea el mismo elemento. No se aplica solo, lo confirma el usuario.
 */
export function suggestRelinks(
  approvedIds: { functionId: string; codeHash: string | null; name: string }[],
  current: DetectedSymbol[],
): { fromFunctionId: string; toFunctionId: string; name: string; filePath: string; previousName: string }[] {
  const currentIds = new Set(current.map((f) => f.id));
  const takenByDocs = new Set(approvedIds.map((a) => a.functionId));
  const out: ReturnType<typeof suggestRelinks> = [];

  for (const approved of approvedIds) {
    if (currentIds.has(approved.functionId) || !approved.codeHash) continue;
    const match = current.find((f) => f.codeHash === approved.codeHash && !takenByDocs.has(f.id));
    if (match) {
      out.push({
        fromFunctionId: approved.functionId,
        toFunctionId: match.id,
        name: match.name,
        filePath: match.filePath,
        previousName: approved.name,
      });
    }
  }
  return out;
}
