import type * as Monaco from 'monaco-editor';

/**
 * El editor (Monaco) que tiene o tuvo el foco el último. Lo usan órdenes que
 * no viven dentro del editor, como la paleta: "plegar al nivel 2" tiene que
 * saber a qué editor se lo dice.
 */
let actual: Monaco.editor.IStandaloneCodeEditor | null = null;

export const fijarEditorActivo = (e: Monaco.editor.IStandaloneCodeEditor | null) => { actual = e; };
export const editorActivo = () => actual;

/** Ejecuta una acción de Monaco en el editor activo, si existe. */
export function accionEditor(id: string) {
  if (!actual) return false;
  actual.focus();
  void actual.getAction(id)?.run();
  return true;
}
