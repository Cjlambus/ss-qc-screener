import { execSync } from 'child_process';
import { mkdirSync, rmSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

// Primary: pure Node.js extraction via pdf-parse (works on any server, no system tools)
async function extractWithPdfParse(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse') as any;
    const parser = new PDFParse({ verbosity: 0, data: buffer });
    await parser.load();
    const result = await parser.getText();
    // result is an object with pages array; concatenate all page text
    if (result && result.pages) {
      return result.pages.map((p: any) => p.text || '').join('\n\n');
    }
    if (typeof result === 'string') return result;
    return '';
  } catch (e: any) {
    console.error('[pdf-ocr] pdf-parse failed:', e?.message);
    return '';
  }
}

// Fallback: system tools (pdftotext + ImageMagick + tesseract) — available in local workspace
async function extractWithSystemTools(buffer: Buffer): Promise<string> {
  const tmpDir = join(os.tmpdir(), `qc_sys_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  const pdfPath = join(tmpDir, 'input.pdf');
  writeFileSync(pdfPath, buffer);

  try {
    // Try pdftotext first (fastest)
    try {
      const text = execSync(`pdftotext -layout "${pdfPath}" -`, { timeout: 15000 }).toString();
      if (text && text.trim().length > 100) return text;
    } catch (e) {}

    // Try ImageMagick + system tesseract
    try {
      const imgPattern = join(tmpDir, 'page_%03d.png');
      execSync(`convert -density 150 "${pdfPath}" -quality 90 "${imgPattern}" 2>/dev/null`, { timeout: 60000 });
      const pages = readdirSync(tmpDir)
        .filter(f => f.startsWith('page_') && f.endsWith('.png'))
        .sort()
        .map(f => join(tmpDir, f));
      const texts: string[] = [];
      for (const p of pages) {
        try {
          const t = execSync(`tesseract "${p}" stdout -l eng --psm 6 2>/dev/null`, { timeout: 30000 }).toString();
          texts.push(t);
        } catch (e) {}
      }
      if (texts.length > 0) return texts.join('\n\n--- PAGE BREAK ---\n\n');
    } catch (e) {}

    return '';
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // 1. Try pure Node pdf-parse first (works everywhere — no system tools required)
  const pdfText = await extractWithPdfParse(buffer);
  if (pdfText && pdfText.trim().length > 100) {
    console.log('[pdf-ocr] Extracted with pdf-parse, length:', pdfText.length);
    return pdfText;
  }

  // 2. Fallback to system tools (local workspace only)
  console.log('[pdf-ocr] pdf-parse returned short/empty text, trying system tools...');
  const sysText = await extractWithSystemTools(buffer);
  if (sysText && sysText.trim().length > 100) {
    console.log('[pdf-ocr] Extracted with system tools, length:', sysText.length);
    return sysText;
  }

  throw new Error('Could not extract text from this PDF. Please ensure it is a valid, readable PDF file.');
}
