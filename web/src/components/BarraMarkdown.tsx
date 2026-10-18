import { editorActivo } from '../lib/editorActivo';

/**
 * Barra de formato para Markdown: negrita, cursiva, títulos, listas, enlaces,
 * código y tablas, sobre la selección (o en el cursor si no hay selección).
 * Escribe el Markdown de siempre; no hay nada oculto.
 */
type Accion = { nombre: string; titulo: string; envolver?: [string, string]; prefijo?: string; insertar?: string };

const ACCIONES: Accion[] = [
  { nombre: 'B', titulo: 'Negrita', envolver: ['**', '**'] },
  { nombre: 'I', titulo: 'Cursiva', envolver: ['_', '_'] },
  { nombre: 'H1', titulo: 'Título', prefijo: '# ' },
  { nombre: 'H2', titulo: 'Subtítulo', prefijo: '## ' },
  { nombre: '•', titulo: 'Lista', prefijo: '- ' },
  { nombre: '1.', titulo: 'Lista numerada', prefijo: '1. ' },
  { nombre: '❝', titulo: 'Cita', prefijo: '> ' },
  { nombre: '</>', titulo: 'Código', envolver: ['`', '`'] },
  { nombre: '{ }', titulo: 'Bloque de código', envolver: ['```\n', '\n```'] },
  { nombre: '🔗', titulo: 'Enlace', envolver: ['[', '](https://)'] },
  { nombre: '▦', titulo: 'Tabla', insertar: '\n| Columna | Columna |\n| --- | --- |\n| | |\n' },
];

function aplicar(a: Accion) {
  const ed = editorActivo();
  const modelo = ed?.getModel();
  const sel = ed?.getSelection();
  if (!ed || !modelo || !sel) return;
  const texto = modelo.getValueInRange(sel);
  if (a.envolver) {
    ed.executeEdits('markdown', [{ range: sel, text: `${a.envolver[0]}${texto}${a.envolver[1]}` }]);
    // Sin selección, el cursor queda entre las marcas, listo para escribir.
    if (!texto) {
      const ini = modelo.getOffsetAt({ lineNumber: sel.startLineNumber, column: sel.startColumn }) + a.envolver[0].length;
      ed.setPosition(modelo.getPositionAt(ini));
    }
  } else if (a.prefijo) {
    const ediciones = [];
    for (let l = sel.startLineNumber; l <= sel.endLineNumber; l++) {
      ediciones.push({ range: { startLineNumber: l, startColumn: 1, endLineNumber: l, endColumn: 1 }, text: a.prefijo });
    }
    ed.executeEdits('markdown', ediciones);
  } else if (a.insertar) {
    ed.executeEdits('markdown', [{ range: sel, text: a.insertar }]);
  }
  ed.focus();
}

export function BarraMarkdown() {
  return (
    <div className="barra-markdown" role="toolbar" aria-label="Formato Markdown">
      {ACCIONES.map((a) => (
        <button key={a.titulo} className="btn sm outline" title={a.titulo} onMouseDown={(e) => e.preventDefault()} onClick={() => aplicar(a)}>
          {a.nombre}
        </button>
      ))}
    </div>
  );
}
