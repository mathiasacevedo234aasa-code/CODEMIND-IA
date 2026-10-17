import { useEffect, useState } from 'react';

/**
 * Vista previa de Markdown, en vivo, al lado del editor.
 *
 * Un .md puede llevar HTML dentro, y este se ve dentro de la aplicación: por
 * eso pasa por DOMPurify antes de pintarse (fuera scripts, manejadores on* y
 * enlaces javascript:). Las dos librerías se cargan la primera vez que se
 * abre una vista previa.
 */
type Conversor = (md: string) => string;
let conversor: Promise<Conversor> | null = null;

function cargar(): Promise<Conversor> {
  conversor ??= Promise.all([import('marked'), import('dompurify')]).then(([{ marked }, { default: DOMPurify }]) =>
    (md: string) => DOMPurify.sanitize(marked.parse(md, { async: false, gfm: true, breaks: false }) as string));
  return conversor;
}

export function VistaMarkdown({ texto }: { texto: string }) {
  const [html, setHtml] = useState('');
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    // Un respiro mientras se escribe: no hace falta repintar en cada tecla.
    const t = window.setTimeout(() => {
      cargar()
        .then((convertir) => { if (vigente) setHtml(convertir(texto)); })
        .catch((e) => { if (vigente) setFallo((e as Error).message); });
    }, 120);
    return () => { vigente = false; window.clearTimeout(t); };
  }, [texto]);

  if (fallo) return <p className="hint" style={{ padding: 12 }}>No se pudo preparar la vista previa: {fallo}</p>;
  // eslint-disable-next-line react/no-danger -- saneado con DOMPurify
  return <div className="md-vista" dangerouslySetInnerHTML={{ __html: html }} />;
}
