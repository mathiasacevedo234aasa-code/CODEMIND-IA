import { generarDocx, generarPdf } from './exportBinario.js';
import { getProject, readDocs, readMemory, readHistory } from './store.js';

/**
 * Convierte la documentacion aprobada en un documento entregable.
 *
 * Solo entra lo APROBADO: las propuestas pendientes no forman parte de la
 * documentacion oficial y no deben aparecer en algo que el usuario va a
 * entregar o publicar.
 */

const escaparHtml = (texto) =>
  String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es') : 'sin fecha');

function bloquesDeDocumento(doc) {
  const partes = [];
  partes.push(['Proposito', doc.proposito]);
  partes.push(['Explicacion', doc.explicacion]);

  if (doc.parametros?.length) {
    partes.push([
      'Parametros',
      doc.parametros
        .map((p) => `- **${p.nombre}**${p.tipo ? ` (${p.tipo})` : ''}: ${p.descripcion} _[${p.certeza}]_`)
        .join('\n'),
    ]);
  }
  if (doc.retorno?.descripcion) {
    partes.push([
      'Retorno',
      `${doc.retorno.descripcion}${doc.retorno.tipo ? ` (${doc.retorno.tipo})` : ''} _[${doc.retorno.certeza ?? 'inferido'}]_`,
    ]);
  }
  if (doc.flujo?.length) {
    partes.push(['Flujo', doc.flujo.map((paso, i) => `${i + 1}. ${paso}`).join('\n')]);
  }
  if (doc.dependencias?.length) {
    partes.push([
      'Dependencias',
      doc.dependencias.map((d) => `- \`${d.nombre}\` (${d.clase}) _[${d.certeza}]_`).join('\n'),
    ]);
  }
  if (doc.ejemplo) partes.push(['Ejemplo de uso', `\`\`\`\n${doc.ejemplo}\n\`\`\``]);
  if (doc.observaciones) partes.push(['Observaciones', doc.observaciones]);
  if (doc.incertidumbres?.length) {
    partes.push([
      'Lo que no puede deducirse del codigo',
      doc.incertidumbres.map((u) => `- ${u}`).join('\n'),
    ]);
  }
  return partes;
}

function generarMarkdown(project, memory, aprobadas, history, { bilingue = false } = {}) {
  const out = [];
  out.push(`# ${project.name}`);
  out.push('');
  out.push(`> Documentacion generada por CodeMind AI el ${fecha(new Date().toISOString())}.`);
  out.push('> Todo el contenido fue revisado y aprobado manualmente.');
  out.push('');

  const o = memory.overview ?? {};
  const campos = [
    ['Objetivo', o.objective || project.objective],
    ['Problema que resuelve', o.problem],
    ['Dirigido a', o.audience],
    ['Tecnologias', o.technologies],
    ['Estado actual', o.status],
    ['Funcionalidades implementadas', o.implemented],
    ['Pendiente', o.pending],
  ].filter(([, v]) => v && String(v).trim());

  if (campos.length) {
    out.push('## Descripcion general', '');
    for (const [titulo, valor] of campos) out.push(`**${titulo}:** ${valor}`, '');
  }

  if (memory.architectureNotes?.trim()) {
    out.push('## Arquitectura', '', memory.architectureNotes.trim(), '');
  }

  // El diagrama va como bloque mermaid: GitHub y muchos visores lo dibujan.
  if (memory.architectureDiagram?.trim()) {
    if (!memory.architectureNotes?.trim()) out.push('## Arquitectura', '');
    out.push('### Dependencias entre archivos', '', '```mermaid', memory.architectureDiagram.trim(), '```', '');
  }

  const porArchivo = new Map();
  for (const doc of aprobadas) {
    if (!porArchivo.has(doc.filePath)) porArchivo.set(doc.filePath, []);
    porArchivo.get(doc.filePath).push(doc);
  }

  if (porArchivo.size) {
    out.push('## Elementos documentados', '');
    for (const [archivo, docs] of [...porArchivo].sort(([a], [b]) => a.localeCompare(b))) {
      out.push(`### ${archivo}`, '');
      for (const entrada of docs.sort((a, b) => a.name.localeCompare(b.name))) {
        out.push(`#### ${entrada.name}`, '');
        out.push(
          `_Aprobado el ${fecha(entrada.approvedAt)}${entrada.model ? ` · modelo ${entrada.model}` : ''}${entrada.edited ? ' · editado manualmente' : ''}_`,
          '',
        );
        for (const [titulo, cuerpo] of bloquesDeDocumento(entrada.doc)) {
          out.push(`**${titulo}**`, '', cuerpo, '');
        }
        // Versión bilingüe: solo traducciones de ESTA versión aprobada; una
        // traducción de una versión anterior diría cosas que ya no son ciertas.
        if (bilingue) {
          for (const [idioma, t] of Object.entries(entrada.traducciones ?? {})) {
            if (t.de !== entrada.versionId) continue;
            out.push(`_${idioma === 'en' ? 'English version' : 'Versión en español'}_`, '');
            for (const [titulo, cuerpo] of bloquesDeDocumento(t.doc)) out.push(`**${titulo}**`, '', cuerpo, '');
          }
        }
        out.push('---', '');
      }
    }
  }

  if (memory.decisions?.length) {
    out.push('## Registro de decisiones', '');
    for (const d of memory.decisions) {
      out.push(`- **${d.title}** (${fecha(d.createdAt)})`);
      if (d.rationale) out.push(`  ${d.rationale}`);
    }
    out.push('');
  }

  if (memory.progress?.length) {
    out.push('## Registro de progreso', '');
    for (const p of memory.progress) {
      out.push(`- [${p.state}] **${p.title}**${p.detail ? ` — ${p.detail}` : ''}`);
    }
    out.push('');
  }

  if (history.versions?.length) {
    out.push('## Historial', '');
    out.push(`Se conservan ${history.versions.length} version(es) anteriores de la documentacion.`, '');
  }

  return out.join('\n');
}

/** Convierte el Markdown generado en una pagina lista para imprimir o guardar. */
function generarHtml(project, markdown) {
  const cuerpo = markdown
    .split('\n')
    .map((linea) => {
      const encabezado = /^(#{1,6})\s+(.*)$/.exec(linea);
      if (encabezado) {
        const nivel = encabezado[1].length;
        return `<h${nivel}>${escaparHtml(encabezado[2])}</h${nivel}>`;
      }
      if (/^---\s*$/.test(linea)) return '<hr>';
      if (/^>\s?/.test(linea)) return `<blockquote>${escaparHtml(linea.replace(/^>\s?/, ''))}</blockquote>`;
      if (/^\s*[-*]\s+/.test(linea)) return `<li>${enriquecer(linea.replace(/^\s*[-*]\s+/, ''))}</li>`;
      if (/^\s*\d+\.\s+/.test(linea)) return `<li>${enriquecer(linea.replace(/^\s*\d+\.\s+/, ''))}</li>`;
      if (!linea.trim()) return '';
      return `<p>${enriquecer(linea)}</p>`;
    })
    .join('\n')
    // Los bloques de codigo se marcan con ``` en el Markdown generado.
    .replace(/<p>```<\/p>([\s\S]*?)<p>```<\/p>/g, (_, dentro) => `<pre>${dentro.replace(/<\/?p>/g, '')}</pre>`);

  function enriquecer(texto) {
    return escaparHtml(texto)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  }

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escaparHtml(project.name)} — Documentacion</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    line-height: 1.7; max-width: 820px; margin: 0 auto; padding: 48px 24px;
    color: #1a1f28; background: #fff;
  }
  h1 { font-size: 2em; border-bottom: 2px solid #5b8cff; padding-bottom: .3em; }
  h2 { margin-top: 2em; border-bottom: 1px solid #e0e4ea; padding-bottom: .3em; }
  h3 { margin-top: 1.6em; color: #2f6bff; }
  h4 { margin-top: 1.4em; font-family: ui-monospace, Consolas, monospace; background: #f4f6fa;
       padding: 6px 10px; border-radius: 6px; border-left: 3px solid #5b8cff; }
  blockquote { border-left: 3px solid #ccd2dc; margin: 0; padding-left: 14px; color: #5b6472; }
  code { font-family: ui-monospace, Consolas, monospace; background: #f4f6fa;
         padding: 1px 5px; border-radius: 4px; font-size: .9em; }
  pre { background: #f4f6fa; padding: 12px 14px; border-radius: 8px; overflow-x: auto;
        font-family: ui-monospace, Consolas, monospace; font-size: .88em; line-height: 1.5; }
  pre code { background: none; padding: 0; }
  hr { border: none; border-top: 1px solid #e0e4ea; margin: 2em 0; }
  li { margin: .25em 0; }
  em { color: #5b6472; font-style: normal; font-size: .88em; }
  @media print { body { padding: 0; max-width: none; } h3 { break-after: avoid; } }
</style>
</head>
<body>
${cuerpo}
</body>
</html>`;
}

export async function exportarDocumentacion(projectId, formato = 'md', opciones = {}) {
  const project = await getProject(projectId);
  const [docs, memory, history] = await Promise.all([
    readDocs(projectId),
    readMemory(projectId),
    readHistory(projectId),
  ]);

  const aprobadas = Object.values(docs.approved);
  const markdown = generarMarkdown(project, memory, aprobadas, history, opciones);

  const base = project.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'documentacion';

  // Los binarios viajan en base64 dentro del mismo JSON: asi la interfaz los
  // descarga igual que los de texto, sin una ruta aparte.
  if (formato === 'pdf') {
    const pdf = await generarPdf(markdown, `${project.name} - documentacion`);
    return { filename: `${base}-documentacion.pdf`, mime: 'application/pdf', content: pdf.toString('base64'), binario: true, documented: aprobadas.length };
  }
  if (formato === 'docx') {
    const docx = await generarDocx(markdown, `${project.name} - documentacion`);
    return {
      filename: `${base}-documentacion.docx`,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      content: docx.toString('base64'),
      binario: true,
      documented: aprobadas.length,
    };
  }

  if (formato === 'html') {
    return {
      filename: `${base}-documentacion.html`,
      mime: 'text/html; charset=utf-8',
      content: generarHtml(project, markdown),
      documented: aprobadas.length,
    };
  }
  return {
    filename: `${base}-documentacion.md`,
    mime: 'text/markdown; charset=utf-8',
    content: markdown,
    documented: aprobadas.length,
  };
}
