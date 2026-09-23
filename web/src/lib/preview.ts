import { api } from './api';
import type { TreeNode } from './types';

/**
 * Previsualizacion de proyectos HTML/CSS/JS sencillos.
 *
 * Construye un documento autonomo resolviendo <link> y <script src> contra los
 * archivos del proyecto, y lo ejecuta dentro de un iframe con sandbox
 * "allow-scripts" (sin allow-same-origin). El codigo previsualizado no comparte
 * origen con la aplicacion, asi que no puede leer su almacenamiento ni llamar a
 * su backend con las credenciales del usuario.
 *
 * Limitacion deliberada y visible: React, Vue, Angular, Svelte o TypeScript
 * necesitan compilacion y un servidor de desarrollo. Eso no se simula aqui.
 */

const RUNTIME = `<script>
(function () {
  var send = function (level, args) {
    try {
      parent.postMessage({ __codemind: true, level: level, text: Array.prototype.map.call(args, function (a) {
        try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); }
      }).join(' ') }, '*');
    } catch (e) {}
  };
  ['log', 'info', 'warn', 'error'].forEach(function (level) {
    var original = console[level];
    console[level] = function () { send(level, arguments); original.apply(console, arguments); };
  });
  window.addEventListener('error', function (e) {
    send('error', [e.message + ' (' + (e.filename || 'inline') + ':' + e.lineno + ')']);
  });
  window.addEventListener('unhandledrejection', function (e) {
    send('error', ['Promesa rechazada sin manejar: ' + (e.reason && e.reason.message ? e.reason.message : e.reason)]);
  });
})();
</script>`;

function resolvePath(base: string, href: string): string {
  if (/^(https?:)?\/\//.test(href) || href.startsWith('data:')) return href;
  const baseParts = base.split('/').slice(0, -1);
  for (const part of href.replace(/^\.\//, '').split('/')) {
    if (part === '..') baseParts.pop();
    else if (part !== '.') baseParts.push(part);
  }
  return baseParts.join('/');
}

export function findHtmlEntries(tree: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.type === 'dir') walk(node.children);
      else if (/\.html?$/i.test(node.name)) out.push(node.path);
    }
  };
  walk(tree);
  return out.sort((a, b) => (a.endsWith('index.html') ? -1 : b.endsWith('index.html') ? 1 : a.localeCompare(b)));
}

export interface PreviewResult {
  html: string;
  warnings: string[];
}

export async function buildPreview(
  projectId: string,
  entryPath: string,
  overrides: Record<string, string>,
): Promise<PreviewResult> {
  const warnings: string[] = [];
  const read = async (path: string): Promise<string | null> => {
    if (overrides[path] !== undefined) return overrides[path];
    try {
      return (await api.readFile(projectId, path)).content;
    } catch {
      return null;
    }
  };

  let html = await read(entryPath);
  if (html === null) throw new Error(`No se pudo leer ${entryPath}.`);

  // Hojas de estilo locales
  const linkRe = /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi;
  for (const tag of html.match(linkRe) ?? []) {
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || /^(https?:)?\/\//.test(href)) continue;
    const css = await read(resolvePath(entryPath, href));
    html = html.replace(tag, css === null ? `<!-- no se encontro ${href} -->` : `<style>\n${css}\n</style>`);
    if (css === null) warnings.push(`No se encontro la hoja de estilos "${href}".`);
  }

  // Scripts locales
  const scriptRe = /<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
  for (const match of [...html.matchAll(scriptRe)]) {
    const [tag, src] = match;
    if (/^(https?:)?\/\//.test(src)) continue;
    if (/\.tsx?$/i.test(src)) {
      warnings.push(`"${src}" es TypeScript: necesita compilacion previa y no se ejecuta en la vista previa.`);
      html = html.replace(tag, `<!-- ${src} requiere compilacion -->`);
      continue;
    }
    const js = await read(resolvePath(entryPath, src));
    const isModule = /type=["']module["']/i.test(tag);
    html = html.replace(
      tag,
      js === null ? `<!-- no se encontro ${src} -->` : `<script${isModule ? ' type="module"' : ''}>\n${js}\n</script>`,
    );
    if (js === null) warnings.push(`No se encontro el script "${src}".`);
  }

  const withRuntime = html.includes('<head>')
    ? html.replace('<head>', `<head>\n${RUNTIME}`)
    : `${RUNTIME}\n${html}`;

  return { html: withRuntime, warnings };
}
