import { useStore } from '../state/useStore';
import { api } from './api';
import type { TreeNode } from './types';

/**
 * Borrador de la descripción general de un proyecto, a partir de su código.
 *
 * Al importar una carpeta, la documentación empieza vacía y la IA no tiene
 * nada en la memoria. Aquí se le da material de verdad: la lista de archivos,
 * los manifiestos (README, package.json, requirements...) y el inventario de
 * lo que encontró el analizador. Lo que devuelve es un BORRADOR: va a los
 * campos del formulario y no se guarda hasta que pulses Guardar.
 */

export const CAMPOS = ['objective', 'problem', 'audience', 'technologies', 'status', 'implemented', 'pending'] as const;
export type Borrador = Record<(typeof CAMPOS)[number], string>;

const MANIFIESTOS = ['README.md', 'readme.md', 'package.json', 'requirements.txt', 'pyproject.toml', 'composer.json', 'pom.xml', 'Cargo.toml', 'go.mod'];

function rutas(nodos: TreeNode[], salida: string[] = []) {
  for (const n of nodos) {
    if (n.type === 'dir') rutas(n.children, salida);
    else salida.push(n.path);
  }
  return salida;
}

async function material(): Promise<string> {
  const st = useStore.getState();
  if (!st.project) return '';
  const todas = rutas(st.tree);
  const partes = [`Archivos del proyecto (${todas.length}):\n${todas.slice(0, 300).join('\n')}`];

  for (const m of MANIFIESTOS) {
    if (!todas.includes(m)) continue;
    const contenido = st.files[m]?.content ?? (await api.readFile(st.project.id, m).catch(() => null))?.content;
    if (contenido) partes.push(`Contenido de ${m}:\n${contenido.slice(0, 3000)}`);
  }

  const inventario = Object.entries(st.analysis)
    .map(([ruta, a]) => {
      const nombres = a.symbols.filter((s) => !s.menor && s.category === 'codigo').map((s) => s.name);
      return nombres.length ? `${ruta}: ${nombres.slice(0, 25).join(', ')}` : null;
    })
    .filter(Boolean)
    .slice(0, 200);
  if (inventario.length) partes.push(`Elementos de código detectados por archivo:\n${inventario.join('\n')}`);
  return partes.join('\n\n');
}

/** Pide el borrador. Devuelve los campos, o el texto tal cual si no vino en el formato pedido. */
export async function pedirBorrador(): Promise<{ campos: Borrador | null; texto: string }> {
  const st = useStore.getState();
  if (!st.project) throw new Error('No hay proyecto abierto.');
  const res = await api.chat({
    projectId: st.project.id,
    mode: 'context',
    contextText: await material(),
    question: [
      'Redacta un borrador de la descripción general del proyecto usando SOLO el material dado.',
      'Responde únicamente con un objeto JSON con estas claves: objective (qué hace el proyecto), problem (qué problema resuelve),',
      'audience (para quién), technologies (lenguajes y librerías que se ven), status (en qué estado parece estar),',
      'implemented (qué funcionalidades ya están), pending (qué parece faltar).',
      'Si algo no se puede deducir del material, pon exactamente "No consta". No inventes.',
    ].join(' '),
  });
  const texto = res.answer;
  const json = /\{[\s\S]*\}/.exec(texto)?.[0];
  if (!json) return { campos: null, texto };
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    const campos = Object.fromEntries(CAMPOS.map((c) => [c, typeof obj[c] === 'string' ? obj[c] as string : 'No consta'])) as Borrador;
    return { campos, texto };
  } catch {
    return { campos: null, texto };
  }
}
