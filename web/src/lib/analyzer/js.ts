import { parse } from '@babel/parser';
import type { DetectedSymbol, SymbolKind } from '../types.ts';
import { CATEGORIA_DE } from '../types.ts';

/**
 * Analizador de JavaScript, TypeScript, JSX y TSX, basado en AST.
 *
 * No se usan expresiones regulares para interpretar estructuras: el parser
 * distingue de verdad un método de clase de un callback anónimo, cosa que una
 * expresión regular no puede hacer.
 *
 * Además de funciones reconoce clases, interfaces, tipos, enumeraciones y
 * constantes exportadas, porque entender un proyecto es también saber qué
 * formas de datos maneja, no solo qué hace.
 */

export interface AnalisisJs {
  simbolos: DetectedSymbol[];
  imports: string[];
  classes: string[];
  error: string | null;
}

type AnyNode = Record<string, any>;

const FUNCIONES = new Set([
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
        return p.argument?.type === 'Identifier' ? `...${p.argument.name}` : '...resto';
      case 'ObjectPattern':
        return `{ ${(p.properties ?? []).map((pr: AnyNode) => pr.key?.name ?? pr.argument?.name ?? '?').join(', ')} }`;
      case 'ArrayPattern':
        return `[ ${(p.elements ?? []).map((el: AnyNode) => el?.name ?? '?').join(', ')} ]`;
      default:
        return `param${i}`;
    }
  });
}

/** Recorrido genérico del AST, sin dependencias extra. */
function walk(
  node: AnyNode | null | undefined,
  visit: (n: AnyNode, parent: AnyNode | null) => boolean | void,
  parent: AnyNode | null = null,
) {
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

function classify(name: string, node: AnyNode, base: SymbolKind): SymbolKind {
  if (/^use[A-Z]/.test(name)) return 'hook personalizado';
  if (/^[A-Z]/.test(name) && returnsJsx(node)) return 'componente React';
  return base;
}

function nameFor(
  node: AnyNode,
  parent: AnyNode | null,
  classStack: string[],
): { name: string; qualified: string; kind: SymbolKind } | null {
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
      const base: SymbolKind = node.type === 'ArrowFunctionExpression' ? 'funcion flecha' : 'expresion de funcion';
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
    return null; // callback anónimo: no ensucia el panel
  }

  return null;
}

export function analizarJs(
  filePath: string,
  codigo: string,
  opciones: { offsetLineas?: number; lenguaje?: string } = {},
): AnalisisJs {
  const offset = opciones.offsetLineas ?? 0;
  const language = opciones.lenguaje ?? 'javascript';

  let ast: AnyNode;
  try {
    ast = parse(codigo, {
      sourceType: 'unambiguous',
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      errorRecovery: true,
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties', 'classPrivateMethods', 'topLevelAwait'],
    }) as unknown as AnyNode;
  } catch (err) {
    return { simbolos: [], imports: [], classes: [], error: (err as Error).message };
  }

  const simbolos: DetectedSymbol[] = [];
  const imports: string[] = [];
  const classes: string[] = [];
  const ocurrencias = new Map<string, number>();
  const classStack: string[] = [];
  const lineas = codigo.split('\n');

  const anadir = (
    nombre: string,
    cualificado: string,
    kind: SymbolKind,
    node: AnyNode,
    extra: Partial<DetectedSymbol> = {},
  ) => {
    const inicio = node.loc?.start?.line ?? 1;
    const fin = node.loc?.end?.line ?? inicio;
    const vistas = ocurrencias.get(cualificado) ?? 0;
    ocurrencias.set(cualificado, vistas + 1);
    simbolos.push({
      id: `${filePath}::${cualificado}#${vistas}`,
      name: nombre,
      qualifiedName: cualificado,
      kind,
      category: CATEGORIA_DE[kind],
      filePath,
      line: inicio + offset,
      endLine: fin + offset,
      isAsync: Boolean(node.async),
      isGenerator: Boolean(node.generator),
      params: FUNCIONES.has(node.type) ? paramNames(node) : [],
      code: lineas.slice(inicio - 1, fin).join('\n').slice(0, 20000),
      codeHash: '',
      language,
      ...extra,
    });
  };

  walk(ast, (node, parent) => {
    if (node.type === 'ImportDeclaration' && node.source?.value) imports.push(String(node.source.value));

    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const name = node.id?.name;
      if (name) {
        classes.push(name);
        classStack.push(name);
        const metodos = (node.body?.body ?? []).filter((m: AnyNode) =>
          m.type === 'ClassMethod' || m.type === 'ClassProperty' || m.type === 'PropertyDefinition',
        ).length;
        const padre = node.superClass?.name;
        anadir(name, name, 'clase', node, {
          detail: `${metodos} miembro(s)${padre ? `, extiende ${padre}` : ''}`,
        });
      }
    }

    if (node.type === 'TSInterfaceDeclaration' && node.id?.name) {
      const campos = (node.body?.body ?? []).length;
      anadir(node.id.name, node.id.name, 'interfaz', node, { detail: `${campos} campo(s)` });
    }

    if (node.type === 'TSTypeAliasDeclaration' && node.id?.name) {
      anadir(node.id.name, node.id.name, 'tipo', node);
    }

    if (node.type === 'TSEnumDeclaration' && node.id?.name) {
      anadir(node.id.name, node.id.name, 'enumeracion', node, { detail: `${(node.members ?? []).length} valor(es)` });
    }

    // Constantes con valor propio (objetos de configuración, tablas de datos,
    // expresiones regulares...). Se excluyen las que son funciones: esas ya
    // entran por su propia rama y no deben aparecer dos veces.
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init) {
      const tipoInit = node.init.type;
      const esFuncion = tipoInit === 'ArrowFunctionExpression' || tipoInit === 'FunctionExpression';
      const interesante =
        tipoInit === 'ObjectExpression' ||
        tipoInit === 'ArrayExpression' ||
        tipoInit === 'NewExpression' ||
        tipoInit === 'RegExpLiteral' ||
        tipoInit === 'TemplateLiteral';
      const declaracion = parent?.type === 'VariableDeclaration' ? parent : null;
      const esConstante = declaracion?.kind === 'const';

      if (!esFuncion && interesante && esConstante) {
        const nombre = node.id.name;
        const resumen =
          tipoInit === 'ObjectExpression'
            ? `objeto con ${(node.init.properties ?? []).length} propiedad(es)`
            : tipoInit === 'ArrayExpression'
              ? `lista de ${(node.init.elements ?? []).length} elemento(s)`
              : tipoInit === 'RegExpLiteral'
                ? 'expresión regular'
                : tipoInit === 'NewExpression'
                  ? `instancia de ${node.init.callee?.name ?? 'algo'}`
                  : 'texto con plantilla';
        anadir(nombre, nombre, 'constante', node, { detail: resumen });
      }
    }

    if (FUNCIONES.has(node.type)) {
      const info = nameFor(node, parent, classStack);
      if (info) {
        anadir(info.name, info.qualified, info.kind, node, {
          detail: FUNCIONES.has(node.type) ? paramNames(node).join(', ') || 'sin parámetros' : undefined,
        });
      }
    }
  });

  return { simbolos, imports: [...new Set(imports)], classes: [...new Set(classes)], error: null };
}
