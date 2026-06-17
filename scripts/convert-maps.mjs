/**
 * convert-maps.mjs — Convert downloaded venue map PDFs to PNG images
 *
 * Uses pdfjs-dist (ESM) + @napi-rs/canvas to render page 1 of each PDF
 * to a PNG at the same path but with .png extension.
 *
 * Usage (standalone):
 *   node scripts/convert-maps.mjs           ← skip already-converted PNGs
 *   node scripts/convert-maps.mjs --force   ← reconvert all
 *
 * Called programmatically from download-maps.js after a PDF is downloaded.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { DOMMatrix, createCanvas } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, statSync, existsSync, readdirSync } from 'fs';
import { join, dirname, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const MAPS_DIR  = join(ROOT, 'maps');

// Polyfill DOMMatrix (needed by pdfjs-dist)
global.DOMMatrix = DOMMatrix;

// Point to the worker bundled alongside the main pdfjs module
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).href;

const RENDER_SCALE = 1.5; // ~200dpi-ish — good quality, reasonable file size
const MAX_PX      = 3000; // cap largest dimension to avoid memory issues

/**
 * Convert a single PDF file to PNG.
 * @param {string} pdfPath  Absolute path to the source PDF
 * @param {string} pngPath  Absolute path for the output PNG
 * @param {object} opts     { force: false }
 * @returns {number|null}   KB saved, or null if skipped
 */
export async function convertPdfToPng(pdfPath, pngPath, opts = {}) {
  if (!opts.force && existsSync(pngPath)) {
    return null; // already converted
  }

  const data = new Uint8Array(readFileSync(pdfPath));
  const doc  = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(1);

  let viewport = page.getViewport({ scale: RENDER_SCALE });

  // Cap to MAX_PX on the largest side
  const maxDim = Math.max(viewport.width, viewport.height);
  if (maxDim > MAX_PX) {
    const cappedScale = RENDER_SCALE * (MAX_PX / maxDim);
    viewport = page.getViewport({ scale: cappedScale });
  }

  const w = Math.round(viewport.width);
  const h = Math.round(viewport.height);

  const canvas = createCanvas(w, h);
  const ctx    = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport }).promise;

  const buf = canvas.toBuffer('image/png');
  writeFileSync(pngPath, buf);
  return Math.round(buf.length / 1024);
}

/**
 * Convert all PDFs found under maps/ that don't yet have a corresponding PNG.
 * @param {object} opts  { force: false }
 * @returns {string[]}   Array of PNG paths that were created/updated
 */
export async function convertAllMaps(opts = {}) {
  const created = [];

  // Walk maps/<season>/ directories
  for (const season of readdirSync(MAPS_DIR)) {
    const seasonDir = join(MAPS_DIR, season);
    try {
      const files = readdirSync(seasonDir);
      for (const file of files) {
        if (extname(file).toLowerCase() !== '.pdf') continue;
        const pdfPath = join(seasonDir, file);
        const pngPath = join(seasonDir, basename(file, extname(file)) + '.png');
        const label   = `  ${season}/${basename(file)}`.padEnd(52);

        if (!opts.force && existsSync(pngPath)) {
          const kb = Math.round(statSync(pngPath).size / 1024);
          console.log(`${label} ⏭  already exists (${kb}KB)`);
          continue;
        }

        process.stdout.write(`${label} ↓  rendering … `);
        try {
          const kb = await convertPdfToPng(pdfPath, pngPath, { force: true });
          console.log(`✓ ${kb}KB → ${basename(pngPath)}`);
          created.push(pngPath);
        } catch (err) {
          console.log(`✗ ${err.message}`);
        }
      }
    } catch {
      // skip if seasonDir isn't a directory
    }
  }

  return created;
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const force = process.argv.includes('--force');
  console.log(`\n🖼  Converting venue map PDFs to PNG (${force ? 'force' : 'skip existing'}) …\n`);
  try {
    const created = await convertAllMaps({ force });
    console.log(`\n✅ ${created.length} PNG(s) created/updated.`);
    if (created.length > 0) {
      console.log('  Paths:', created.map(p => p.replace(ROOT + '\\', '')).join(', '));
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}
