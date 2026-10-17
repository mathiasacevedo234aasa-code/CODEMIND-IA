import { useState } from 'react';
import { useStore } from '../state/useStore';
import type { SnippetPropio } from '../lib/types';
import { Icon } from './Icon';

const LENGUAJES: [string, string][] = [
  ['', 'Todos'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['python', 'Python'],
  ['java', 'Java'],
  ['csharp', 'C#'],
  ['php', 'PHP'],
  ['markdown', 'Markdown'],
];

const VACIO: SnippetPropio = { prefijo: '', descripcion: '', lenguaje: '', cuerpo: '' };

/**
 * Snippets propios, además de Emmet.
 *
 * Se escriben con la sintaxis de Monaco/VS Code: $1, $2 son los saltos con
 * Tab, ${1:nombre} uno con texto de ejemplo y $0 dónde acaba el cursor.
 */
export function SnippetsPropios() {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const lista = settings.snippets ?? [];
  const [editando, setEditando] = useState<{ indice: number | null; s: SnippetPropio } | null>(null);

  const guardar = () => {
    if (!editando || !editando.s.prefijo.trim() || !editando.s.cuerpo.trim()) return;
    const limpio = { ...editando.s, prefijo: editando.s.prefijo.trim() };
    const nueva = editando.indice === null
      ? [...lista, limpio]
      : lista.map((x, i) => (i === editando.indice ? limpio : x));
    void saveSettings({ snippets: nueva });
    setEditando(null);
  };

  return (
    <div className="field">
      <label>Snippets propios</label>
      <p className="hint">
        Escribe el prefijo en el editor y elígelo de la lista. En el cuerpo, <code>$1</code>, <code>$2</code> son los
        saltos con Tab, <code>{'${1:nombre}'}</code> lleva texto de ejemplo y <code>$0</code> es dónde acaba el cursor.
      </p>
      {lista.map((s, i) => (
        <div key={`${s.prefijo}${i}`} className="stash-fila">
          <code>{s.prefijo}</code>
          <span className="msg">{s.descripcion || s.cuerpo.split('\n')[0]}</span>
          <span className="hint">{LENGUAJES.find(([id]) => id === (s.lenguaje ?? ''))?.[1] ?? s.lenguaje}</span>
          <button className="btn icon sm" title="Editar" onClick={() => setEditando({ indice: i, s: { ...VACIO, ...s } })}>
            <Icon name="edit" size={12} />
          </button>
          <button
            className="btn icon sm"
            title="Borrar"
            onClick={() => { if (window.confirm(`¿Borrar el snippet "${s.prefijo}"?`)) void saveSettings({ snippets: lista.filter((_, j) => j !== i) }); }}
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      ))}
      {!editando ? (
        <button className="btn sm outline" style={{ marginTop: 6 }} onClick={() => setEditando({ indice: null, s: { ...VACIO } })}>
          <Icon name="plus" size={12} /> Nuevo snippet
        </button>
      ) : (
        <div className="card" style={{ marginTop: 6 }}>
          <div className="grid2">
            <input placeholder="Prefijo (p. ej. clog)" value={editando.s.prefijo}
              onChange={(e) => setEditando({ ...editando, s: { ...editando.s, prefijo: e.target.value } })} />
            <select value={editando.s.lenguaje ?? ''}
              onChange={(e) => setEditando({ ...editando, s: { ...editando.s, lenguaje: e.target.value } })}>
              {LENGUAJES.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </select>
          </div>
          <input style={{ marginTop: 6 }} placeholder="Descripción (opcional)" value={editando.s.descripcion}
            onChange={(e) => setEditando({ ...editando, s: { ...editando.s, descripcion: e.target.value } })} />
          <textarea style={{ marginTop: 6, minHeight: 90, fontFamily: 'var(--mono)' }}
            placeholder={'console.log(\'${1:valor}:\', ${1:valor});$0'}
            value={editando.s.cuerpo}
            onChange={(e) => setEditando({ ...editando, s: { ...editando.s, cuerpo: e.target.value } })} />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn sm primary" disabled={!editando.s.prefijo.trim() || !editando.s.cuerpo.trim()} onClick={guardar}>
              Guardar
            </button>
            <button className="btn sm outline" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
