import { create } from 'zustand';

/**
 * Diálogo de entrada de texto propio.
 *
 * Electron NO implementa window.prompt: lanza "prompt() is not supported" y el
 * botón que lo invocaba se queda muerto sin decir nada. Eso dejaba sin servicio
 * crear archivo, crear carpeta, renombrar, crear rama y regenerar con
 * indicación. Este diálogo funciona igual en el navegador y en la aplicación
 * instalada, y además permite validar antes de aceptar.
 */

export interface PromptRequest {
  title: string;
  label?: string;
  /** Texto inicial del campo. */
  value?: string;
  placeholder?: string;
  hint?: string;
  confirmText?: string;
  /** Devuelve un mensaje de error, o null si el valor es aceptable. */
  validate?: (value: string) => string | null;
  /** Permite aceptar con el campo vacío (para entradas opcionales). */
  allowEmpty?: boolean;
  multiline?: boolean;
}

interface DialogState {
  current: (PromptRequest & { resolve: (value: string | null) => void }) | null;
  open: (request: PromptRequest & { resolve: (value: string | null) => void }) => void;
  close: (value: string | null) => void;
}

export const useDialogs = create<DialogState>((set, get) => ({
  current: null,
  open: (request) => set({ current: request }),
  close: (value) => {
    const { current } = get();
    set({ current: null });
    current?.resolve(value);
  },
}));

/** Pide un texto al usuario. Devuelve null si cancela. */
export function ask(request: PromptRequest): Promise<string | null> {
  return new Promise((resolve) => {
    // Si ya hubiera uno abierto, se cancela: nunca dos diálogos a la vez.
    const anterior = useDialogs.getState().current;
    if (anterior) useDialogs.getState().close(null);
    useDialogs.getState().open({ ...request, resolve });
  });
}

// --------------------------------------------------------- validaciones

const CARACTERES_PROHIBIDOS = /[<>:"|?*\u0000-\u001f]/;
const RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Valida el nombre o la ruta relativa de un archivo o carpeta del proyecto. */
export function validarRutaRelativa(value: string): string | null {
  const clean = value.trim();
  if (!clean) return 'Escribe un nombre.';
  if (clean.startsWith('/') || clean.startsWith('\\')) return 'La ruta debe ser relativa al proyecto.';
  if (/^[a-zA-Z]:/.test(clean)) return 'Escribe una ruta dentro del proyecto, no una ruta absoluta.';
  if (clean.includes('..')) return 'La ruta no puede salir del proyecto.';
  if (CARACTERES_PROHIBIDOS.test(clean)) return 'No se admiten los caracteres < > : " | ? *';

  for (const parte of clean.split(/[\\/]/)) {
    if (!parte) return 'La ruta tiene carpetas vacías.';
    if (RESERVADOS_WINDOWS.test(parte)) return `"${parte}" es un nombre reservado por Windows.`;
    if (parte.endsWith('.') || parte.endsWith(' ')) return 'Ningún nombre puede terminar en punto ni en espacio.';
  }
  return null;
}

/** Valida el nombre de una rama de git segun las reglas de git check-ref-format. */
export function validarNombreRama(value: string): string | null {
  const clean = value.trim();
  if (!clean) return 'Escribe un nombre para la rama.';
  if (/[\s~^:?*[\\]/.test(clean)) return 'No se admiten espacios ni los caracteres ~ ^ : ? * [ \\';
  if (clean.startsWith('-') || clean.startsWith('/') || clean.endsWith('/')) return 'Nombre de rama no válido.';
  if (clean.includes('..') || clean.includes('@{')) return 'Nombre de rama no válido.';
  if (clean.endsWith('.lock')) return 'El nombre no puede terminar en ".lock".';
  return null;
}
