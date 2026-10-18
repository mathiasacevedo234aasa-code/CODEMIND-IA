import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/useStore';
import { puntuar } from '../lib/difuso';
import { Icon } from './Icon';

/**
 * Ir a cualquier símbolo del proyecto (Ctrl+T).
 *
 * Usa lo que el analizador ya sabe de los 22 lenguajes: escribes parte del
 * nombre y saltas a su línea, esté en el archivo que esté. La búsqueda es
 * "difusa" a propósito: `ctot` encuentra `calcularTotal`, porque nadie
 * recuerda el nombre exacto de lo que escribió hace un mes.
 */

export function BuscarSimbolo() {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [elegido, setElegido] = useState(0);
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const goToSymbol = useStore((s) => s.goToSymbol);
  const project = useStore((s) => s.project);
  const entrada = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 't') {
        if (!useStore.getState().project) return;
        e.preventDefault();
        setAbierto(true);
        setConsulta('');
        setElegido(0);
      }
      if (e.key === 'Escape') setAbierto(false);
    };
    const alPedir = () => { setAbierto(true); setConsulta(''); setElegido(0); };
    window.addEventListener('keydown', alPulsar);
    window.addEventListener('codemind:buscar-simbolo', alPedir);
    return () => {
      window.removeEventListener('keydown', alPulsar);
      window.removeEventListener('codemind:buscar-simbolo', alPedir);
    };
  }, []);

  useEffect(() => { if (abierto) setTimeout(() => entrada.current?.focus(), 0); }, [abierto]);

  const resultados = useMemo(() => {
    if (!abierto) return [];
    return symbolsFn()
      .filter((s) => !s.menor)
      .map((s) => ({ s, p: puntuar(consulta, s.qualifiedName) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p)
      .slice(0, 60)
      .map((x) => x.s);
  }, [abierto, consulta, symbolsFn, analysis]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!abierto || !project) return null;

  const ir = (i: number) => {
    const s = resultados[i];
    if (!s) return;
    setAbierto(false);
    void goToSymbol(s);
  };

  return (
    <div className="overlay palette-overlay" onClick={() => setAbierto(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Icon name="fn" size={15} />
          <input
            ref={entrada}
            placeholder="Ir a un símbolo del proyecto: función, clase, regla CSS..."
            value={consulta}
            onChange={(e) => { setConsulta(e.target.value); setElegido(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setElegido((v) => Math.min(v + 1, resultados.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setElegido((v) => Math.max(v - 1, 0)); }
              if (e.key === 'Enter') ir(elegido);
            }}
          />
        </div>
        <div className="palette-list">
          {resultados.length === 0 && <p className="hint" style={{ padding: 12 }}>Nada coincide con «{consulta}».</p>}
          {resultados.map((s, i) => (
            <div
              key={s.id}
              className={`palette-item ${i === elegido ? "active" : ""}`}
              onMouseEnter={() => setElegido(i)}
              onClick={() => ir(i)}
            >
              <span className="palette-title"><code>{s.qualifiedName}</code></span>
              <span className="tag muted">{s.kind}</span>
              <span className="meta" style={{ marginLeft: 'auto' }}>{s.filePath}:{s.line}</span>
            </div>
          ))}
        </div>
        <p className="hint" style={{ padding: '6px 12px' }}>
          ↑ ↓ para moverte · Enter para ir · F12 sobre un nombre en el editor salta a su definición
        </p>
      </div>
    </div>
  );
}
