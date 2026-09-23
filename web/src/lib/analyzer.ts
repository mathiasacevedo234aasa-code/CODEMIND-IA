import { parse } from '@babel/parser';
import type { DetectedFunction, FunctionKind } from './types';

/**
 * Analizador de funciones basado en AST (@babel/parser).
 *
 * No usamos expresiones regulares para interpretar estructuras: el parser
 * entiende JS, TS, JSX y TSX. Si el archivo esta a medio escribir y no puede
 * parsearse, devolvemos el ultimo resultado valido conocido para no vaciar el
 * panel mientras el usuario escribe.
 */

const SUPPORTED = new Set(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'vue', 'svelte']);

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
    json: 'json', md: 'markdown', vue: 'html', svelte: 'html', svg: 'xml', yml: 'yaml', yaml: 'yaml',
  };
  return map[ext] ?? 'plaintext';
}

export const isAnalyzable = (path: string) => SUPPORTED.has(extensionOf(path));

/** Hash estable y barato (FNV-1a) del cuerpo normalizado de la funcion. */
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
  functions: DetectedFunction[];
  imports: string[];
  classes: string[];
  error: string | null;
}

const EMPTY: FileAnalysis = { functions: [], imports: [], classes: [], error: null };

/** Cache del ultimo analisis valido por archivo, para tolerar codigo incompleto. */
const lastGood = new Map<string, FileAnalysis>();

type AnyNode = Record<string, any>;

const FUNCTION_NODES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassMethod',
  'ClassPrivateMethod',
  'ObjectMethod',
]);

function paramNames(node: AnyNode): string[] {
  return (node.params ?? []).map((p: AnyNode, i: number) => {
    switch (p.type) {
      case 'Identifier':
        return p.name;
      case 'AssignmentPattern':
        return p.left?.type === 'Identifier' ? `${p.left.name} (con valor por defecto)` : `param${i}`;
      case 'RestElement':
        return p.argument?.type === 'Identifier' ? `...${p.argument.name}` : `...resto`;
      case 'ObjectPattern':
        return `{ ${(p.properties ?? [])
          .map((prop: AnyNode) => prop.key?.name ?? prop.argument?.name ?? '?')
          .join(', ')} }`;
      case 'ArrayPattern':
        return `[ ${(p.elements ?? []).map((el: AnyNode) => el?.name ?? '?').join(', ')} ]`;
      default:
        return `param${i}`;
    }
  });
}

function returnsJsx(node: AnyNode): boolean {
  let found = false;
  walk(node, (n) => {
    if (found) return false;
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

/** Recorrido generico del AST sin dependencias extra. */
function walk(node: AnyNode | null | undefined, visit: (n: AnyNode, parent: AnyNode | null) => boolean | void, parent: AnyNode | null = null) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node, parent) === false) return;
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'comments') continue;
    const value = (node as AnyNode)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && typeof child.type === 'string') walk(child, visit, node);
      }
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, visit, node);
    }
  }
}

function classify(name: string, node: AnyNode, base: FunctionKind): FunctionKind {
  if (/^use[A-Z]/.test(name)) return 'hook personalizado';
  if (/^[A-Z]/.test(name) && returnsJsx(node)) return 'componente React';
  return base;
}

/**
 * Deduce el nombre de una funcion a partir de su contexto sintactico.
 * Devuelve null para funciones realmente anonimas (callbacks sueltos), que no
 * se listan en el panel para no llenarlo de ruido.
 */
function nameFor(node: AnyNode, parent: AnyNode | null, classStack: string[]): { name: string; qualified: string; kind: FunctionKind } | null {
  if (node.type === 'FunctionDeclaration') {
    const name = node.id?.name;
    if (!name) return { name: 'default', qualified: 'default', kind: 'funcion exportada por defecto' };
    return { name, qualified: name, kind: classify(name, node, 'funcion') };
  }

  if (node.type === 'ClassMethod' || node.type === 'ClassPrivateMethod') {
    const key = node.key?.name ?? node.key?.id?.name ?? node.key?.value ?? '(computada)';
    const cls = classStack[classStack.length - 1] ?? 'Clase';
    return { name: key, qualified: `${cls}.${key}`, kind: 'metodo de clase' };
  }

  if (node.type === 'ObjectMethod') {
    const key = node.key?.name ?? node.key?.value ?? '(computada)';
    return { name: key, qualified: key, kind: 'metodo de objeto' };
  }

  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') {
      const name = parent.id.name;
      const base: FunctionKind = node.type === 'ArrowFunctionExpression' ? 'funcion flecha' : 'expresion de funcion';
      return { name, qualified: name, kind: classify(name, node, base) };
    }
    if (parent?.type === 'ClassProperty' || parent?.type === 'PropertyDefinition') {
      const key = parent.key?.name ?? '(computada)';
      const cls = classStack[classStack.length - 1] ?? 'Clase';
      return { name: key, qualified: `${cls}.${key}`, kind: 'metodo de clase' };
    }
    if (parent?.type === 'ObjectProperty' && parent.key) {
      const key = parent.key.name ?? parent.key.value;
      if (key) return { name: String(key), qualified: String(key), kind: 'metodo de objeto' };
    }
    if (parent?.type === 'ExportDefaultDeclaration') {
      return { name: 'default', qualified: 'default', kind: 'funcion exportada por defecto' };
    }
    if (parent?.type === 'AssignmentExpression' && parent.left?.type === 'MemberExpression') {
      const obj = parent.left.object?.name ?? '';
      const prop = parent.left.property?.name ?? '';
      if (prop) return { name: prop, qualified: obj ? `${obj}.${prop}` : prop, kind: 'metodo de objeto' };
    }
    return null; // callback anonimo
  }

  return null;
}

/** Extrae el bloque <script> de un archivo .vue o .svelte para poder analizarlo. */
function extractScript(source: string): { code: string; offset: number } {
  const match = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(source);
  if (!match) return { code: '', offset: 0 };
  const before = source.slice(0, match.index + match[0].indexOf(match[1]));
  return { code: match[1], offset: before.split('\n').length - 1 };
}

export function analyzeFile(filePath: string, source: string): FileAnalysis {
  if (!isAnalyzable(filePath)) return EMPTY;

  const ext = extensionOf(filePath);
  const isSfc = ext === 'vue' || ext === 'svelte';
  const { code, offset } = isSfc ? extractScript(source) : { code: source, offset: 0 };
  if (!code.trim()) return EMPTY;

  const lines = source.split('\n');
  let ast: AnyNode;
  try {
    ast = parse(code, {
      sourceType: 'unambiguous',
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      errorRecovery: true,
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties', 'classPrivateMethods', 'topLevelAwait'],
    }) as unknown as AnyNode;
  } catch (err) {
    // Codigo incompleto: conservamos el ultimo analisis correcto.
    const previous = lastGood.get(filePath);
    return previous
      ? { ...previous, error: (err as Error).message }
      : { ...EMPTY, error: (err as Error).message };
  }

  const functions: DetectedFunction[] = [];
  const imports: string[] = [];
  const classes: string[] = [];
  const occurrences = new Map<string, number>();
  const classStack: string[] = [];
  const language = languageOf(filePath);

  walk(ast, (node, parent) => {
    if (node.type === 'ImportDeclaration' && node.source?.value) imports.push(String(node.source.value));
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const name = node.id?.name;
      if (name) {
        classes.push(name);
        classStack.push(name);
      }
    }

    if (FUNCTION_NODES.has(node.type)) {
      const info = nameFor(node, parent, classStack);
      if (info) {
        const startLine = (node.loc?.start?.line ?? 1) + offset;
        const endLine = (node.loc?.end?.line ?? startLine) + offset;
        const snippet = lines.slice(startLine - 1, endLine).join('\n');
        const seen = occurrences.get(info.qualified) ?? 0;
        occurrences.set(info.qualified, seen + 1);
        // La identidad incluye archivo y ocurrencia: dos funciones con el mismo
        // nombre en archivos distintos nunca se confunden.
        const id = `${filePath}::${info.qualified}#${seen}`;
        functions.push({
          id,
          name: info.name,
          qualifiedName: info.qualified,
          kind: info.kind,
          filePath,
          line: startLine,
          endLine,
          isAsync: Boolean(node.async),
          isGenerator: Boolean(node.generator),
          params: paramNames(node),
          code: snippet,
          codeHash: hashCode(snippet),
          language,
        });
      }
    }
  });

  const result: FileAnalysis = { functions, imports: [...new Set(imports)], classes: [...new Set(classes)], error: null };
  lastGood.set(filePath, result);
  return result;
}

export function forgetFile(filePath: string) {
  lastGood.delete(filePath);
}

/**
 * Intenta reasignar documentacion cuando una funcion cambia de nombre o de
 * archivo: si el codigo es identico (mismo hash) y el id antiguo ya no existe,
 * proponemos la reasignacion. No se aplica sola, la confirma el usuario.
 */
export function suggestRelinks(
  approvedIds: { functionId: string; codeHash: string | null; name: string }[],
  current: DetectedFunction[],
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
