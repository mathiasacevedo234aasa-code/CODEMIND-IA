import { useSyncExternalStore } from 'react';
import type * as Monaco from 'monaco-editor';
import { useStore } from '../state/useStore';
import type { TemaVsCode } from './types';

/**
 * El tema de la aplicación: oscuro, claro, o el que tenga el sistema (y que
 * cambia solo cuando el sistema cambia, p. ej. al anochecer).
 */
const consulta = () => (typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null);

function suscribir(aviso: () => void) {
  const mq = consulta();
  mq?.addEventListener('change', aviso);
  return () => mq?.removeEventListener('change', aviso);
}

/** true si lo que se ve ahora es oscuro, resolviendo "sistema". */
export function useTemaOscuro(): boolean {
  const elegido = useStore((s) => s.settings.editor.theme);
  const sistemaOscuro = useSyncExternalStore(suscribir, () => consulta()?.matches ?? true);
  return elegido === 'sistema' ? sistemaOscuro : elegido !== 'light';
}

/** Nombre del tema de Monaco a usar: el importado de VS Code si lo hay. */
export function useTemaMonaco(): string {
  const oscuro = useTemaOscuro();
  const importado = useStore((s) => s.settings.editor.temaVsCode);
  const altoContraste = useStore((s) => Boolean(s.settings.editor.altoContraste));
  // El alto contraste manda: es una necesidad, no una preferencia de estilo.
  if (altoContraste) return oscuro ? 'hc-black' : 'hc-light';
  if (importado) return NOMBRE_IMPORTADO;
  return oscuro ? 'vs-dark' : 'light';
}

export const NOMBRE_IMPORTADO = 'codemind-vscode';

/** Registra en Monaco el tema importado (si lo hay). Se llama al montar un editor. */
export function registrarTemaImportado(monaco: typeof Monaco, tema?: TemaVsCode) {
  const t = tema ?? useStore.getState().settings.editor.temaVsCode;
  if (!t) return;
  monaco.editor.defineTheme(NOMBRE_IMPORTADO, {
    base: t.base,
    inherit: true,
    rules: t.reglas,
    colors: t.colores,
  });
  // Si se importa con un editor ya abierto, se aplica en el acto.
  if (tema) monaco.editor.setTheme(NOMBRE_IMPORTADO);
}

/** Quita comentarios y comas finales: los temas de VS Code son JSON "con comentarios". */
function jsonConComentarios(texto: string): unknown {
  let salida = '';
  let enCadena = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      salida += c;
      if (c === '\\') { salida += texto[++i] ?? ''; continue; }
      if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') { enCadena = true; salida += c; continue; }
    if (c === '/' && texto[i + 1] === '/') { while (i < texto.length && texto[i] !== '\n') i++; salida += '\n'; continue; }
    if (c === '/' && texto[i + 1] === '*') { i = texto.indexOf('*/', i + 2); if (i < 0) break; i++; continue; }
    salida += c;
  }
  return JSON.parse(salida.replace(/,(\s*[}\]])/g, '$1'));
}

const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : null);

/**
 * Convierte un tema de VS Code (.json) al formato de Monaco.
 *
 * Los colores de la interfaz del editor ("editor.background"...) se llaman
 * igual en los dos y pasan tal cual. El resaltado no es idéntico: VS Code
 * colorea por "scopes" de TextMate y Monaco por sus propios tokens, que se
 * parecen pero no siempre coinciden. Se traducen los scopes por su raíz
 * (comment, string, keyword...), que es lo que más se nota.
 */
export function convertirTemaVsCode(texto: string, nombreArchivo: string): TemaVsCode {
  const datos = jsonConComentarios(texto) as {
    name?: string; type?: string; colors?: Record<string, string>;
    tokenColors?: { scope?: string | string[]; settings?: { foreground?: string; fontStyle?: string } }[];
  };
  if (!datos || typeof datos !== 'object' || (!datos.colors && !datos.tokenColors)) {
    throw new Error('No parece un tema de VS Code: le faltan "colors" y "tokenColors".');
  }
  const colores: Record<string, string> = {};
  for (const [k, v] of Object.entries(datos.colors ?? {})) if (hex(v)) colores[k] = v;

  const reglas: TemaVsCode['reglas'] = [];
  for (const tc of datos.tokenColors ?? []) {
    const fg = hex(tc.settings?.foreground);
    const estilo = tc.settings?.fontStyle;
    if (!fg && !estilo) continue;
    const scopes = Array.isArray(tc.scope) ? tc.scope : String(tc.scope ?? '').split(',');
    for (const s of scopes.map((x) => x.trim()).filter(Boolean)) {
      reglas.push({
        token: s,
        ...(fg ? { foreground: fg.replace('#', '').slice(0, 6) } : {}),
        ...(estilo ? { fontStyle: estilo } : {}),
      });
    }
  }
  const claro = datos.type === 'light' || datos.type === 'hcLight';
  return {
    nombre: datos.name || nombreArchivo.replace(/\.json$/i, ''),
    base: claro ? 'vs' : 'vs-dark',
    oscuro: !claro,
    reglas,
    colores,
  };
}
