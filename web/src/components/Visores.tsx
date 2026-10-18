import { useEffect, useState } from 'react';
import { useStore } from '../state/useStore';
import { api } from '../lib/api';
import { tipoMedio, urlRaw } from '../lib/medios';

/** Imagen, PDF, fuente, vídeo o audio del proyecto, dentro del editor. */
export function VisorMedio({ ruta }: { ruta: string }) {
  const project = useStore((s) => s.project);
  const [info, setInfo] = useState<string | null>(null);
  if (!project) return null;
  const url = urlRaw(project.id, ruta);
  const tipo = tipoMedio(ruta);

  if (tipo === 'imagen') {
    return (
      <div className="visor-medio">
        <img
          src={url}
          alt={ruta}
          onLoad={(e) => setInfo(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} px`)}
        />
        <p className="hint">{ruta}{info ? ` · ${info}` : ''}</p>
      </div>
    );
  }
  if (tipo === 'pdf') return <iframe className="visor-pdf" src={url} title={ruta} />;
  if (tipo === 'video') return <div className="visor-medio"><video src={url} controls /></div>;
  if (tipo === 'audio') return <div className="visor-medio"><audio src={url} controls /></div>;
  if (tipo === 'fuente') return <VisorFuente ruta={ruta} url={url} />;
  return null;
}

function VisorFuente({ ruta, url }: { ruta: string; url: string }) {
  const familia = `vista-${ruta.replace(/[^\w]/g, '_')}`;
  const [estado, setEstado] = useState<'cargando' | 'lista' | 'error'>('cargando');
  useEffect(() => {
    const f = new FontFace(familia, `url(${url})`);
    f.load().then((cargada) => { document.fonts.add(cargada); setEstado('lista'); }).catch(() => setEstado('error'));
  }, [familia, url]);
  if (estado === 'error') return <p className="hint" style={{ padding: 16 }}>No se pudo cargar la fuente.</p>;
  return (
    <div className="visor-fuente" style={{ fontFamily: `'${familia}', monospace` }}>
      <p className="hint" style={{ fontFamily: 'var(--sans)' }}>{ruta}</p>
      {[48, 32, 20, 14].map((t) => (
        <p key={t} style={{ fontSize: t, margin: '6px 0' }}>El veloz murciélago hindú comía feliz cardillo y kiwi. 0123456789</p>
      ))}
      <p style={{ fontSize: 20 }}>ABCDEFGHIJKLMNÑOPQRSTUVWXYZ abcdefghijklmnñopqrstuvwxyz áéíóú ¿?¡! {'{}[]()<>=+-*/'}</p>
    </div>
  );
}

/**
 * Archivos de texto de más de 2 MB: no caben en el editor, así que se leen
 * por tramos de 512 KB, de solo lectura, con anterior/siguiente.
 */
export function VisorTramos({ ruta }: { ruta: string }) {
  const project = useStore((s) => s.project);
  const [tramo, setTramo] = useState<{ desde: number; hasta: number; total: number; texto: string } | null>(null);
  const [historial, setHistorial] = useState<number[]>([]);
  const [fallo, setFallo] = useState<string | null>(null);

  const cargar = async (desde: number) => {
    if (!project) return;
    try { setTramo(await api.tramo(project.id, ruta, desde)); } catch (e) { setFallo((e as Error).message); }
  };
  useEffect(() => { void cargar(0); }, [ruta]); // eslint-disable-line react-hooks/exhaustive-deps

  if (fallo) return <p className="hint" style={{ padding: 16 }}>{fallo}</p>;
  if (!tramo) return <p className="hint" style={{ padding: 16 }}><span className="spinner" /> Leyendo…</p>;
  const mb = (n: number) => (n / 1024 / 1024).toFixed(2);
  return (
    <div className="visor-tramos">
      <div className="visor-tramos-barra">
        <span className="tag warn">Solo lectura</span>
        <span className="hint">Archivo de {mb(tramo.total)} MB: demasiado grande para editarlo. Bytes {tramo.desde.toLocaleString()}–{tramo.hasta.toLocaleString()} ({Math.round((tramo.hasta / tramo.total) * 100)} %).</span>
        <span style={{ flex: 1 }} />
        <button className="btn sm outline" disabled={!historial.length} onClick={() => { const prev = historial[historial.length - 1]; setHistorial((h) => h.slice(0, -1)); void cargar(prev); }}>← Anterior</button>
        <button className="btn sm outline" disabled={tramo.hasta >= tramo.total} onClick={() => { setHistorial((h) => [...h, tramo.desde]); void cargar(tramo.hasta); }}>Siguiente →</button>
      </div>
      <pre className="visor-tramos-texto">{tramo.texto}</pre>
    </div>
  );
}
