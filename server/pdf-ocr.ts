import { execSync } from 'child_process';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const tmpDir = join(os.tmpdir(), `qc_ocr_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });

  const pdfPath = join(tmpDir, 'input.pdf');
  const require = (await import('module')).createRequire(import.meta.url);
  const fs = require('fs');
  fs.writeFileSync(pdfPath, buffer);

  try {
    // First try pdftotext (fast, works for text-based PDFs)
    try {
      const text = execSync(`pdftotext -layout "${pdfPath}" -`, { timeout: 15000 }).toString();
      if (text && text.trim().length > 100) {
        return text;
      }
    } catch (e) {
      // pdftotext not available or failed — fall through to OCR
    }

    // Convert PDF pages to images using ImageMagick + Ghostscript
    const imgPattern = join(tmpDir, 'page_%03d.png');
    execSync(`convert -density 150 "${pdfPath}" -quality 90 "${imgPattern}" 2>/dev/null`, {
      timeout: 120000,
    });

    // Get all page images
    const pages = readdirSync(tmpDir)
      .filter(f => f.startsWith('page_') && f.endsWith('.png'))
      .sort()
      .map(f => join(tmpDir, f));

    if (pages.length === 0) {
      throw new Error('No pages converted from PDF');
    }

    // OCR each page with tesseract
    const texts: string[] = [];
    for (const pagePath of pages) {
      try {
        const text = execSync(`tesseract "${pagePath}" stdout -l eng --psm 6 2>/dev/null`, {
          timeout: 30000,
        }).toString();
        texts.push(text);
      } catch (e) {
        // Skip failed pages
      }
    }

    return texts.join('\n\n--- PAGE BREAK ---\n\n');
  } finally {
    // Cleanup temp directory
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}
