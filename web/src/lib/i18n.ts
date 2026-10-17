import { useStore } from '../state/useStore';

/**
 * Idioma de la interfaz.
 *
 * La clave de cada texto es el propio texto en español: el código se sigue
 * leyendo igual que antes y, si falta una traducción, sale en español en vez
 * de una clave rara. Los huecos van entre llaves: t('Hay {n} cambios', { n }).
 *
 * Lo que escribe la IA no pasa por aquí: el idioma se le indica al backend
 * (ajuste `idioma`) y responde directamente en él.
 */
export type Idioma = 'es' | 'en';

const EN: Record<string, string> = {
  // Barra lateral y paneles
  'Explorador': 'Explorer',
  'Explorador de archivos': 'File explorer',
  'Buscar en el proyecto': 'Search in project',
  'Elementos del proyecto': 'Project symbols',
  'Control de versiones': 'Source control',
  'Ejecutar y previsualizar': 'Run and preview',
  'Centro de documentación': 'Documentation center',
  'Configuración': 'Settings',
  'Git no está disponible en este equipo': 'Git is not available on this computer',
  'Ocultar el panel': 'Hide panel',
  'Ocultar el panel del asistente': 'Hide assistant panel',
  'Mostrar el panel del asistente': 'Show assistant panel',
  'Revisión': 'Review',
  'Documentación': 'Documentation',
  'Asistente': 'Assistant',
  'Lo documentado del archivo que tienes abierto': 'What is documented in the open file',
  'Cargando el editor...': 'Loading the editor...',
  // Panel inferior
  'Consola': 'Console',
  'Errores': 'Problems',
  'Comprobaciones': 'Checks',
  'Terminal': 'Terminal',
  'Vista previa': 'Preview',
  'Procesos': 'Processes',
  'Registro de Git': 'Git log',
  // Barra superior
  'Guardar': 'Save',
  'Ejecutar': 'Run',
  'Proyectos': 'Projects',
  // Bienvenida
  'Nuevo proyecto': 'New project',
  'Abrir una carpeta del equipo': 'Open a folder',
  'Proyectos guardados': 'Saved projects',
  'Escribe código, entiende lo que construyes y documenta tus funciones cuando tú lo decidas. La IA explica; tú apruebas. Nada se escribe en tus archivos sin tu confirmación.':
    'Write code, understand what you build and document your functions when you decide. The AI explains; you approve. Nothing is written to your files without your confirmation.',
  // Ajustes
  'Idioma': 'Language',
  'Idioma de la interfaz y de lo que escribe la IA (explicaciones, documentación y respuestas del asistente).':
    'Language of the interface and of what the AI writes (explanations, documentation and assistant answers).',
  'Nivel de las explicaciones': 'Explanation level',
  'Principiante — evita la jerga y explica los términos': 'Beginner — avoids jargon and explains terms',
  'Intermedio — para quien ya programa': 'Intermediate — for people who already code',
  'Avanzado — al grano, con los detalles finos': 'Advanced — to the point, with the fine details',
  'Cambia el tono y la profundidad de lo que escribe la IA, no los hechos: sigue sin poder inventarse nada ni corregir tu código.':
    'Changes the tone and depth of what the AI writes, not the facts: it still cannot make things up or fix your code.',
  'Estilo de la documentación': 'Documentation style',
  'Normal — completa y equilibrada': 'Normal — complete and balanced',
  'Breve — lo justo, en una o dos frases por campo': 'Brief — just enough, one or two sentences per field',
  'Didáctico — para estudiantes, con ejemplos comentados': 'Teaching — for students, with commented examples',
  'Formal — tono de referencia, ejemplo en formato JSDoc o docstring': 'Formal — reference tone, example as JSDoc or docstring',
  'Se combina con el nivel de arriba: el nivel decide a quién se explica y el estilo, cómo se escribe.':
    'Combined with the level above: the level decides who it is for, the style how it is written.',
  'Temperatura ({t})': 'Temperature ({t})',
  'Tokens máximos de respuesta': 'Max response tokens',
  'Editor': 'Editor',
  'Tema': 'Theme',
  'Oscuro': 'Dark',
  'Claro': 'Light',
  'Cerrar': 'Close',
  // Tour, atajos y novedades
  'Las vistas, a la izquierda': 'Views, on the left',
  'Explorador, Buscar, Elementos del proyecto, Git, GitHub y Ejecutar. Pulsa el mismo icono otra vez para plegar el panel.':
    'Explorer, Search, Project symbols, Git, GitHub and Run. Click the same icon again to collapse the panel.',
  'El editor': 'The editor',
  'Con ▷ (o F5) ejecutas el archivo abierto. Pasa el cursor sobre algo documentado para leer su explicación, y F12 te lleva a su definición.':
    'Use ▷ (or F5) to run the open file. Hover over something documented to read its explanation; F12 takes you to its definition.',
  'Revisión, Documentación y Asistente': 'Review, Documentation and Assistant',
  'Lo que propone la IA llega a Revisión y no es oficial hasta que lo apruebas. En Documentación lees lo aprobado del archivo abierto.':
    'What the AI proposes lands in Review and is not official until you approve it. Documentation shows what was approved for the open file.',
  'Consola, Terminal y compañía': 'Console, Terminal and friends',
  'El terminal es de verdad, Comprobaciones ejecuta tus pruebas y tipos, y Vista previa enseña tu página. Ctrl+Shift+P abre todos los comandos.':
    'The terminal is real, Checks runs your tests and types, and Preview shows your page. Ctrl+Shift+P opens every command.',
  '{n} de {total}': '{n} of {total}',
  'Saltar': 'Skip',
  'Atrás': 'Back',
  'Siguiente': 'Next',
  'Empezar': 'Start',
  'Atajos de teclado': 'Keyboard shortcuts',
  'Paleta de comandos: cualquier acción y cualquier archivo': 'Command palette: any action and any file',
  'Ir a un símbolo del proyecto': 'Go to a project symbol',
  'Ir a la definición de lo que hay bajo el cursor': 'Go to the definition under the cursor',
  'Ejecutar el archivo abierto en el Terminal': 'Run the open file in the Terminal',
  'Buscar y reemplazar en todo el proyecto': 'Search and replace across the project',
  'Explicar con la IA el código seleccionado': 'Explain the selected code with the AI',
  'Enviar la pregunta al asistente': 'Send the question to the assistant',
  'Esta lista': 'This list',
  'En Mac, Ctrl es ⌘.': 'On Mac, Ctrl is ⌘.',
  'Qué hay de nuevo en la {v}': "What's new in {v}",
  'Entendido': 'Got it',
};

const DICCIONARIOS: Record<Idioma, Record<string, string>> = { es: {}, en: EN };

export function traducir(idioma: Idioma, texto: string, huecos?: Record<string, string | number>): string {
  let salida = DICCIONARIOS[idioma]?.[texto] ?? texto;
  if (huecos) for (const [k, v] of Object.entries(huecos)) salida = salida.split(`{${k}}`).join(String(v));
  return salida;
}

/** Fuera de React (listas fijas, mensajes): lee el idioma actual. */
export const t = (texto: string, huecos?: Record<string, string | number>) =>
  traducir((useStore.getState().settings.idioma ?? 'es') as Idioma, texto, huecos);

/** Dentro de un componente: se vuelve a pintar al cambiar de idioma. */
export function useT() {
  const idioma = useStore((s) => s.settings.idioma ?? 'es') as Idioma;
  return (texto: string, huecos?: Record<string, string | number>) => traducir(idioma, texto, huecos);
}
