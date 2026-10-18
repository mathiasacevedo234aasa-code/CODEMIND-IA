import { api } from './api';

/**
 * Formatear con Prettier al guardar (si está activado en Configuración).
 *
 * Es una herramienta que eliges tú, determinista y sin IA: cambia espacios,
 * comillas y saltos de línea, nunca lo que hace el código. Solo se aplica al
 * guardar a mano (Ctrl+S o Guardar), nunca en el autoguardado: reformatear
 * mientras escribes te movería el cursor.
 *
 * Prettier se carga la primera vez que hace falta. Si el proyecto tiene su
 * .prettierrc (JSON), se respeta.
 */
const PARSER: Record<string, string> = {
  js: 'babel', mjs: 'babel', cjs: 'babel', jsx: 'babel',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  json: 'json',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', htm: 'html', vue: 'vue',
  md: 'markdown', mdx: 'mdx',
  yml: 'yaml', yaml: 'yaml',
};

export const sePuedeFormatear = (ruta: string) => Boolean(PARSER[ruta.split('.').pop()?.toLowerCase() ?? '']);

let cargado: Promise<{ format: (t: string, o: Record<string, unknown>) => Promise<string>; plugins: unknown[] }> | null = null;
function prettier() {
  cargado ??= Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
    import('prettier/plugins/typescript'),
    import('prettier/plugins/postcss'),
    import('prettier/plugins/html'),
    import('prettier/plugins/markdown'),
    import('prettier/plugins/yaml'),
  ]).then(([p, ...plugins]) => ({ format: p.format, plugins }));
  return cargado;
}

const configuraciones = new Map<string, Promise<Record<string, unknown>>>();
function configDelProyecto(projectId: string) {
  let c = configuraciones.get(projectId);
  if (!c) {
    c = api.readFile(projectId, '.prettierrc')
      .then((r) => JSON.parse(r.content) as Record<string, unknown>)
      .catch(() => ({}));
    configuraciones.set(projectId, c);
  }
  return c;
}

/** Devuelve el texto formateado, o el mismo si no se puede (y por qué). */
export async function formatear(projectId: string, ruta: string, texto: string): Promise<{ texto: string; error?: string }> {
  const parser = PARSER[ruta.split('.').pop()?.toLowerCase() ?? ''];
  if (!parser) return { texto };
  try {
    const { format, plugins } = await prettier();
    const config = await configDelProyecto(projectId);
    return { texto: await format(texto, { ...config, parser, plugins }) };
  } catch (err) {
    // Código con errores de sintaxis: Prettier no puede, y se guarda tal cual.
    return { texto, error: (err as Error).message.split('\n')[0] };
  }
}
