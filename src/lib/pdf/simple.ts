import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/** Normaliza o texto para a codificação WinAnsi das fontes padrão do PDF. */
export function pdfSafe(text: string) {
  return (text ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
    .replace(/[‐-―]/g, '-').replace(/ /g, ' ').replace(/\t/g, '  ')
    .replace(/[^\x0A\x0D\x20-\x7E -ÿ€]/g, '');
}

export class SimplePdf {
  doc!: PDFDocument;
  page!: PDFPage;
  font!: PDFFont;
  bold!: PDFFont;
  y = 0;
  readonly margin = 56;
  readonly width = 595.28;
  readonly height = 841.89;

  static async create(title: string) {
    const p = new SimplePdf();
    p.doc = await PDFDocument.create();
    p.doc.setTitle(pdfSafe(title));
    p.doc.setProducer('PilatesFlow');
    p.doc.setCreator('PilatesFlow');
    p.font = await p.doc.embedFont(StandardFonts.Helvetica);
    p.bold = await p.doc.embedFont(StandardFonts.HelveticaBold);
    p.newPage();
    return p;
  }

  newPage() {
    this.page = this.doc.addPage([this.width, this.height]);
    this.y = this.height - this.margin;
  }

  ensure(h: number) {
    if (this.y - h < this.margin) this.newPage();
  }

  text(t: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; align?: 'left' | 'center' | 'right'; gap?: number } = {}) {
    const size = opts.size ?? 11;
    const font = opts.bold ? this.bold : this.font;
    const maxW = this.width - this.margin * 2;
    const lines = this.wrap(pdfSafe(t), font, size, maxW);
    for (const line of lines) {
      this.ensure(size * 1.45);
      const w = font.widthOfTextAtSize(line, size);
      const x = opts.align === 'center' ? (this.width - w) / 2 : opts.align === 'right' ? this.width - this.margin - w : this.margin;
      this.page.drawText(line, { x, y: this.y - size, size, font, color: rgb(...(opts.color ?? [0.12, 0.16, 0.14])) });
      this.y -= size * 1.45;
    }
    this.y -= opts.gap ?? 0;
  }

  paragraph(t: string, size = 11) {
    for (const block of pdfSafe(t).split(/\n/)) {
      if (!block.trim()) { this.y -= size * 0.8; continue; }
      this.text(block, { size });
    }
  }

  line(gap = 10) {
    this.ensure(gap * 2);
    this.y -= gap;
    this.page.drawLine({ start: { x: this.margin, y: this.y }, end: { x: this.width - this.margin, y: this.y }, thickness: 0.6, color: rgb(0.8, 0.82, 0.8) });
    this.y -= gap;
  }

  kv(label: string, value: string) {
    this.ensure(18);
    this.page.drawText(pdfSafe(label), { x: this.margin, y: this.y - 10, size: 9, font: this.font, color: rgb(0.42, 0.45, 0.43) });
    this.page.drawText(pdfSafe(value || '-'), { x: this.margin + 150, y: this.y - 10, size: 11, font: this.bold, color: rgb(0.12, 0.16, 0.14) });
    this.y -= 20;
  }

  footer(text: string) {
    const pages = this.doc.getPages();
    pages.forEach((pg, i) => {
      pg.drawText(pdfSafe(`${text}  ·  Página ${i + 1} de ${pages.length}`), { x: this.margin, y: 28, size: 8, font: this.font, color: rgb(0.5, 0.52, 0.5) });
    });
  }

  private wrap(text: string, font: PDFFont, size: number, maxW: number) {
    const words = text.split(/ +/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= maxW) cur = test;
      else {
        if (cur) lines.push(cur);
        if (font.widthOfTextAtSize(w, size) > maxW) {
          let chunk = '';
          for (const ch of w) { if (font.widthOfTextAtSize(chunk + ch, size) > maxW) { lines.push(chunk); chunk = ch; } else chunk += ch; }
          cur = chunk;
        } else cur = w;
      }
    }
    if (cur || !lines.length) lines.push(cur);
    return lines;
  }

  async bytes() {
    return this.doc.save();
  }
}

export function pdfResponse(bytes: Uint8Array, filename: string, inline = true) {
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
