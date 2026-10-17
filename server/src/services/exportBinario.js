import PDFDocument from 'pdfkit';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

/**
 * PDF y Word a partir del Markdown que ya genera la exportación.
 *
 * Se parte del Markdown, y no del HTML, porque es la versión más simple y
 * estructurada de la misma información: encabezados, párrafos, listas y
 * bloques de código. Así los cuatro formatos dicen exactamente lo mismo y
 * solo cambia cómo se ve.
 *
 * Las dos librerías son JavaScript puro a propósito: un módulo nativo más es
 * justo el tipo de dependencia que ya dio problemas al empaquetar.
 */

/** Trocea el Markdown en bloques que cualquier formato sabe pintar. */
export function bloquesDeMarkdown(markdown) {
  const bloques = [];
  let codigo = null;

  for (const linea of markdown.split(/\r?\n/)) {
    if (linea.startsWith('```')) {
      if (codigo) {
        bloques.push({ tipo: 'codigo', texto: codigo.join('\n') });
        codigo = null;
      } else {
        codigo = [];
      }
      continue;
    }
    if (codigo) {
      codigo.push(linea);
      continue;
    }
    const titulo = /^(#{1,4})\s+(.*)$/.exec(linea);
    if (titulo) {
      bloques.push({ tipo: 'titulo', nivel: titulo[1].length, texto: limpiar(titulo[2]) });
    } else if (/^\s*[-*]\s+/.test(linea)) {
      bloques.push({ tipo: 'lista', texto: limpiar(linea.replace(/^\s*[-*]\s+/, '')) });
    } else if (/^\s*\d+\.\s+/.test(linea)) {
      // Numerada: el numero ya va en el texto, no lleva viñeta encima.
      bloques.push({ tipo: 'numerada', texto: limpiar(linea.trim()) });
    } else if (linea.trim() === '---') {
      bloques.push({ tipo: 'separador' });
    } else if (linea.trim()) {
      bloques.push({ tipo: 'parrafo', texto: limpiar(linea) });
    }
  }
  if (codigo) bloques.push({ tipo: 'codigo', texto: codigo.join('\n') });
  return bloques;
}

/** Quita la sintaxis de Markdown que en un documento sería ruido. */
const limpiar = (texto) => texto
  .replace(/\*\*(.+?)\*\*/g, '$1')
  // Cursiva de Markdown: _texto_ o *texto*. En un documento sobra la marca.
  .replace(/(^|\s)_(.+?)_(?=\s|$|[.,;:])/g, '$1$2')
  .replace(/(^|\s)\*(?!\s)(.+?)\*(?=\s|$|[.,;:])/g, '$1$2')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/^>\s?/, '');

// ------------------------------------------------------------------- PDF

/**
 * Las fuentes estándar de PDF solo traen los caracteres de Europa occidental.
 * Los acentos y la ñ están; un emoji o una flecha, no, y pdfkit los pinta como
 * basura. Se sustituyen por algo legible antes de escribir.
 */
const paraPdf = (texto) => texto
  .replace(/[→⟶]/g, '->')
  .replace(/[←]/g, '<-')
  .replace(/[✓✔]/g, 'v')
  .replace(/[✗✘×]/g, 'x')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[—–]/g, '-')
  .replace(/…/g, '...')
  .replace(/[^\u0000-ÿ]/g, '');

export function generarPdf(markdown, titulo) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: paraPdf(titulo), Creator: 'CodeMind AI' } });
    const partes = [];
    doc.on('data', (p) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const tamanos = { 1: 20, 2: 15, 3: 12.5, 4: 11 };
    for (const b of bloquesDeMarkdown(markdown)) {
      if (b.tipo === 'titulo') {
        doc.moveDown(b.nivel === 1 ? 0.2 : 0.7);
        doc.font('Helvetica-Bold').fontSize(tamanos[b.nivel]).fillColor('#1a1f28').text(paraPdf(b.texto));
        doc.moveDown(0.25);
      } else if (b.tipo === 'parrafo') {
        doc.font('Helvetica').fontSize(10.5).fillColor('#22262e').text(paraPdf(b.texto), { lineGap: 2 });
        doc.moveDown(0.35);
      } else if (b.tipo === 'lista') {
        doc.font('Helvetica').fontSize(10.5).fillColor('#22262e').text(`•  ${paraPdf(b.texto)}`, { indent: 10, lineGap: 2 });
      } else if (b.tipo === 'numerada') {
        doc.font('Helvetica').fontSize(10.5).fillColor('#22262e').text(paraPdf(b.texto), { indent: 10, lineGap: 2 });
      } else if (b.tipo === 'codigo') {
        doc.moveDown(0.2);
        doc.font('Courier').fontSize(9).fillColor('#333').text(paraPdf(b.texto), { indent: 12, lineGap: 1 });
        doc.moveDown(0.4);
      } else if (b.tipo === 'separador') {
        doc.moveDown(0.4);
        const y = doc.y;
        doc.moveTo(56, y).lineTo(doc.page.width - 56, y).strokeColor('#ccd2dc').stroke();
        doc.moveDown(0.6);
      }
    }
    doc.end();
  });
}

// ------------------------------------------------------------------ Word

export async function generarDocx(markdown, titulo) {
  const niveles = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4 };
  const parrafos = [];

  for (const b of bloquesDeMarkdown(markdown)) {
    if (b.tipo === 'titulo') {
      parrafos.push(new Paragraph({ text: b.texto, heading: niveles[b.nivel] }));
    } else if (b.tipo === 'parrafo') {
      parrafos.push(new Paragraph({ children: [new TextRun(b.texto)], spacing: { after: 120 } }));
    } else if (b.tipo === 'lista') {
      parrafos.push(new Paragraph({ text: b.texto, bullet: { level: 0 } }));
    } else if (b.tipo === 'numerada') {
      parrafos.push(new Paragraph({ text: b.texto, indent: { left: 360 } }));
    } else if (b.tipo === 'codigo') {
      for (const linea of b.texto.split('\n')) {
        parrafos.push(new Paragraph({ children: [new TextRun({ text: linea || ' ', font: 'Consolas', size: 18 })] }));
      }
      parrafos.push(new Paragraph({ text: '' }));
    } else if (b.tipo === 'separador') {
      parrafos.push(new Paragraph({ text: '', border: { bottom: { color: 'CCD2DC', size: 6, style: 'single', space: 4 } } }));
    }
  }

  const documento = new Document({
    creator: 'CodeMind AI',
    title: titulo,
    sections: [{ children: parrafos }],
  });
  return Packer.toBuffer(documento);
}
