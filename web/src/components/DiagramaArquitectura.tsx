import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/useStore';
import { construirMapa } from '../lib/projectMap';
import { dibujarMermaid, mermaidDesdeMapa } from '../lib/diagrama';
import { Icon } from './Icon';

/** Pinta un diagrama Mermaid; si el código no es válido, lo dice en vez de quedarse en blanco. */
function Lienzo({ codigo }: { codigo: string }) {
  const oscuro = useStore((s) => s.settings.editor.theme === 'dark');
  const [svg, setSvg] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    setSvg(null);
    setFallo(null);
    dibujarMermaid(codigo, oscuro)
      .then((s) => { if (vigente) setSvg(s); })
      .catch((e) => { if (vigente) setFallo((e as Error).message); });
    return () => { vigente = false; };
  }, [codigo, oscuro]);
  if (fallo) return <p className="hint" style={{ color: 'var(--bad)' }}>No se pudo dibujar el diagrama: {fallo}</p>;
  if (!svg) return <p className="hint"><span className="spinner" /> Dibujando...</p>;
  // El SVG lo genera Mermaid en modo estricto (sin HTML en las etiquetas).
  return <div className="diagrama-svg" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * Diagrama de la arquitectura en la sección Arquitectura.
 *
 * Se genera del mapa de dependencias, se enseña y solo se guarda si lo
 * apruebas. Lo guardado entra en la exportación como bloque ```mermaid, que
 * GitHub, GitLab y muchos editores de Markdown dibujan solos.
 */
export function DiagramaArquitectura() {
  const memory = useStore((s) => s.memory);
  const analysis = useStore((s) => s.analysis);
  const approved = useStore((s) => s.approved);
  const saveMemory = useStore((s) => s.saveMemory);
  const [borrador, setBorrador] = useState<string | null>(null);
  const [verCodigo, setVerCodigo] = useState(false);

  const guardado = memory?.architectureDiagram ?? '';
  const documentados = useMemo(() => new Set(Object.values(approved).map((d) => d.functionId)), [approved]);

  const generar = () => {
    const mapa = construirMapa(analysis, documentados);
    if (!mapa.nodos.some((n) => !n.externo)) {
      setBorrador('');
      return;
    }
    setBorrador(mermaidDesdeMapa(mapa));
  };

  const mostrado = borrador ?? guardado;

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0 }}>Diagrama</h4>
        {borrador !== null && <span className="tag warn">sin guardar</span>}
        <span style={{ flex: 1 }} />
        {mostrado && (
          <button className="btn sm outline" onClick={() => setVerCodigo((v) => !v)}>
            {verCodigo ? 'Ver dibujo' : 'Ver código Mermaid'}
          </button>
        )}
        <button className="btn sm outline" onClick={generar} title="Se genera de los import reales del código, sin IA">
          <Icon name="refresh" size={12} /> {guardado ? 'Regenerar desde el mapa' : 'Generar desde el mapa'}
        </button>
      </div>

      {borrador === '' && <p className="hint">Todavía no hay dependencias entre archivos que dibujar.</p>}
      {!mostrado && borrador === null && (
        <p className="hint">Genera un diagrama de qué archivo depende de cuál, agrupado por carpetas. Lo revisas antes de guardarlo.</p>
      )}
      {mostrado && (verCodigo ? <pre className="log-raw">{mostrado}</pre> : <Lienzo codigo={mostrado} />)}

      {borrador && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            className="btn primary sm"
            onClick={() => void saveMemory({ architectureDiagram: borrador }).then(() => setBorrador(null))}
          >
            <Icon name="check" size={12} /> Guardar en la arquitectura
          </button>
          <button className="btn sm outline" onClick={() => setBorrador(null)}>Descartar</button>
        </div>
      )}
    </div>
  );
}
