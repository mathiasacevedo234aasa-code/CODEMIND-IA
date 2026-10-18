/**
 * El borrador del proyecto: un bloc de notas que se abre como una pestaña más
 * pero vive en la carpeta de datos de CodeMind AI, no en tu proyecto. Esta
 * ruta especial no existe en el disco del proyecto a propósito.
 */
export const BORRADOR = 'codemind:borrador';
export const esBorrador = (ruta: string | null | undefined) => ruta === BORRADOR;
