import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api, type EstadisticasProyecto } from '../lib/api';

const kb = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Barras horizontales sencillas: etiqueta, barra proporcional y valor. */
function Barras({ datos, unidad = '' }: { datos: [string, number][]; unidad?: string }) {
  const max = Math.max(1, ...datos.map(([, v]) => v));
  return (
    <div className="barras">
      {datos.map(([etiqueta, v]) => (
        <div key={etiqueta} className="barra-fila">
          <span className="barra-etiqueta" title={etiqueta}>{etiqueta}</span>
          <span className="barra-pista"><span style={{ width: `${(v / max) * 100}%` }} /></span>
          <span className="barra-valor">{v.toLocaleString()}{unidad}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Informe del proyecto: tamaño, lenguajes, archivos grandes, los más
 * modificados, actividad de git y ritmo de documentación de los últimos seis
 * meses. Todo sale de hechos, sin IA.
 */
export function Estadisticas() {
  const project = useStore((s) => s.project);
  const [datos, setDatos] = useState<EstadisticasProyecto | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  useEffect(() => {
    if (!project) return;
    api.estadisticas(project.id).then(setDatos).catch((e) => setFallo((e as Error).message));
  }, [project]);

  if (fallo) return <p className="hint">{fallo}</p>;
  if (!datos) return <p className="hint"><span className="spinner" /> Calculando…</p>;

  const meses = Object.keys({ ...(datos.git?.porMes ?? {}), ...datos.documentacion.porMes }).sort().slice(-6);
  return (
    <>
      <div className="grid2">
        <div className="card"><h4>Tamaño</h4><p className="meta">{datos.archivos.toLocaleString()} archivos · {datos.lineas.toLocaleString()} líneas</p></div>
        <div className="card"><h4>Documentación</h4><p className="meta">{datos.documentacion.aprobadas} elemento(s) con documentación aprobada</p></div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h4>Líneas por tipo de archivo</h4>
        <Barras datos={datos.porLenguaje.map((l) => [`.${l.ext} (${l.archivos})`, l.lineas])} />
      </div>

      <div className="grid2" style={{ marginTop: 12, alignItems: 'start' }}>
        <div className="card">
          <h4>Archivos más grandes</h4>
          {datos.masGrandes.map((f) => <div key={f.ruta} className="mapa-fila"><code>{f.ruta}</code><span className="hint">{kb(f.bytes)}</span></div>)}
        </div>
        <div className="card">
          <h4>Más modificados (6 meses)</h4>
          {datos.git ? datos.git.masModificados.map((f) => <div key={f.ruta} className="mapa-fila"><code>{f.ruta}</code><span className="hint">{f.veces} commit(s)</span></div>)
            : <p className="hint">Sin repositorio de git.</p>}
        </div>
      </div>

      {meses.length > 0 && (
        <div className="grid2" style={{ marginTop: 12, alignItems: 'start' }}>
          <div className="card">
            <h4>Commits por mes</h4>
            {datos.git ? <Barras datos={meses.map((m) => [m, datos.git!.porMes[m] ?? 0])} /> : <p className="hint">Sin repositorio de git.</p>}
            {datos.git && <p className="hint">{datos.git.commits} commit(s) de {datos.git.autores.map((a) => `${a.nombre} (${a.commits})`).join(', ')}</p>}
          </div>
          <div className="card">
            <h4>Documentación aprobada por mes</h4>
            <Barras datos={meses.map((m) => [m, datos.documentacion.porMes[m] ?? 0])} />
          </div>
        </div>
      )}
    </>
  );
}
