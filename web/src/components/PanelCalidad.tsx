import { useMemo, useState } from 'react';
import { useStore } from '../state/useStore';
import { complejidad, duplicados, formato, invisibles, pendientes } from '../lib/calidadCodigo';

type Vista = 'pendientes' | 'duplicados' | 'complejidad' | 'formato' | 'invisibles';

/**
 * Calidad del código, todo informativo: TODO/FIXME, código repetido,
 * funciones complejas, sangría y finales de línea mezclados, y caracteres
 * invisibles. Nada se cambia desde aquí; pulsar lleva a la línea.
 */
export function PanelCalidad() {
  const sources = useStore((s) => s.sources);
  const files = useStore((s) => s.files);
  const symbolsFn = useStore((s) => s.symbols);
  const analysis = useStore((s) => s.analysis);
  const [vista, setVista] = useState<Vista>('pendientes');

  // Lo del editor (aunque no esté guardado) manda sobre lo del disco.
  const fuentes = useMemo(() => {
    const f = { ...sources };
    for (const [ruta, a] of Object.entries(files)) if (ruta in f) f[ruta] = a.content;
    return f;
  }, [sources, files]);

  const datos = useMemo(() => ({
    pendientes: pendientes(fuentes),
    duplicados: duplicados(fuentes),
    complejidad: complejidad(symbolsFn()),
    formato: formato(fuentes),
    invisibles: invisibles(fuentes),
  }), [fuentes, symbolsFn, analysis]); // eslint-disable-line react-hooks/exhaustive-deps

  const ir = async (ruta: string, linea: number) => {
    const st = useStore.getState();
    await st.openFile(ruta);
    st.jumpToLine(ruta, linea);
  };

  const pestanas: [Vista, string, number][] = [
    ['pendientes', 'TODO / FIXME', datos.pendientes.length],
    ['duplicados', 'Código repetido', datos.duplicados.length],
    ['complejidad', 'Complejidad', datos.complejidad.length],
    ['formato', 'Sangría y finales de línea', datos.formato.length],
    ['invisibles', 'Caracteres invisibles', datos.invisibles.length],
  ];

  const Fila = ({ ruta, linea, children }: { ruta: string; linea: number; children: React.ReactNode }) => (
    <div className="problema con-ruta" onClick={() => void ir(ruta, linea)}>
      <code>{ruta}:{linea}</code>
      <span className="msg">{children}</span>
    </div>
  );

  return (
    <div className="problemas">
      <div className="problemas-filtros">
        {pestanas.map(([id, nombre, n]) => (
          <button key={id} className={`mode-chip ${vista === id ? 'active' : ''}`} onClick={() => setVista(id)}>
            {nombre} {n > 0 && <span className="tag muted">{n}</span>}
          </button>
        ))}
        <span className="hint">Solo informativo: nada de esto es un error ni se cambia solo.</span>
      </div>
      {vista === 'pendientes' && (datos.pendientes.length
        ? datos.pendientes.map((h, i) => <Fila key={i} ruta={h.ruta} linea={h.linea}><span className="tag warn">{h.tipo}</span> {h.texto}</Fila>)
        : <p className="hint">No hay TODO ni FIXME en los archivos analizados.</p>)}
      {vista === 'duplicados' && (datos.duplicados.length
        ? datos.duplicados.map((g, i) => (
          <div key={i} className="card" style={{ marginBottom: 6 }}>
            <pre className="log-raw" style={{ maxHeight: 80, margin: '0 0 4px' }}>{g.muestra}</pre>
            {g.lugares.map((l, j) => <Fila key={j} ruta={l.ruta} linea={l.linea}>aparece aquí</Fila>)}
          </div>
        ))
        : <p className="hint">No se han encontrado bloques de 6 o más líneas repetidos.</p>)}
      {vista === 'complejidad' && (datos.complejidad.length
        ? datos.complejidad.map(({ s, complejidad: c, lineas }) => (
          <Fila key={s.id} ruta={s.filePath} linea={s.line}>
            <strong>{s.qualifiedName}</strong> · complejidad {c}{c > 10 ? ' (alta)' : ''} · {lineas} líneas{lineas > 80 ? ' (larga)' : ''}
          </Fila>
        ))
        : <p className="hint">Ninguna función pasa de complejidad 10 ni de 80 líneas.</p>)}
      {vista === 'formato' && (datos.formato.length
        ? datos.formato.map((h, i) => <Fila key={i} ruta={h.ruta} linea={h.linea}>{h.texto}</Fila>)
        : <p className="hint">Sangría y finales de línea coherentes en todos los archivos.</p>)}
      {vista === 'invisibles' && (datos.invisibles.length
        ? datos.invisibles.map((h, i) => <Fila key={i} ruta={h.ruta} linea={h.linea}>{h.texto}</Fila>)
        : <p className="hint">No hay caracteres invisibles sospechosos.</p>)}
    </div>
  );
}
