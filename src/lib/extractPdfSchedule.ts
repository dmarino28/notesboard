/**
 * extractPdfSchedule.ts — Bucket 6C
 *
 * Positional PDF text extraction using pdfjs-dist.
 *
 * Strategy:
 *   1. Load the PDF via pdfjs-dist (Node.js, no worker).
 *   2. For each page, collect text items with their X/Y coordinates
 *      from the transform matrix (transform[4]=x, transform[5]=y).
 *   3. Group items into rows using a 3-pt Y-bucket tolerance.
 *   4. Sort rows top-to-bottom (descending Y in PDF space = reading order).
 *   5. Find the header row ("Territory … Release Date") to skip preamble.
 *   6. For each data row: detect region headings; otherwise find the
 *      rightmost DATE_RE token as the date, everything to its left as territory.
 *   7. Fallback: if positional parse yields < 5 rows, concatenate all page
 *      text and run through parseReleaseSchedule (text parse).
 */

import path from "path";
import type { ReleaseScheduleItem } from "./boards";
import {
  DATE_RE,
  normalizeLine,
  isNoise,
  isRegionHeading,
  normalizeDate,
  sortItems,
  parseReleaseSchedule,
} from "./parseReleaseSchedule";
import type { ParseResult } from "./parseReleaseSchedule";

// ── Internal types ─────────────────────────────────────────────────────────────

type PdfTextItem = { str: string; x: number; y: number };

// ── PDF item extraction ────────────────────────────────────────────────────────

async function getPdfItems(buffer: Buffer): Promise<PdfTextItem[][]> {
  const { getDocument, GlobalWorkerOptions } = await import(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — pdfjs-dist v5 only ships .mjs; types are on the root package
    "pdfjs-dist/legacy/build/pdf.mjs"
  );

  // Point pdfjs at the worker bundle via a file:// URL.
  // Setting workerSrc = "" triggers "Setting up fake worker failed" in v5;
  // a concrete file:// URL is required for Node.js server-side usage.
  const workerPath = path.resolve(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  );
  GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
  console.log("[extractPdfSchedule] workerSrc set", GlobalWorkerOptions.workerSrc);

  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data }).promise;

  const pages: PdfTextItem[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      const t = raw.transform as number[];
      items.push({ str: raw.str, x: t[4], y: t[5] });
    }
    pages.push(items);
    page.cleanup();
  }
  await doc.cleanup();
  return pages;
}

// ── Positional parse ───────────────────────────────────────────────────────────

function positionalParse(
  allPageItems: PdfTextItem[][],
): { rows: ReleaseScheduleItem[]; regionOrder: string[] } {
  const rows: ReleaseScheduleItem[] = [];
  const regionOrder: string[] = [];
  let currentRegion: string | null = null;
  let foundHeader = false;

  for (const pageItems of allPageItems) {
    // Group by Y with 3-pt tolerance
    const yBuckets = new Map<number, PdfTextItem[]>();
    for (const item of pageItems) {
      const yKey = Math.round(item.y / 3) * 3;
      if (!yBuckets.has(yKey)) yBuckets.set(yKey, []);
      yBuckets.get(yKey)!.push(item);
    }

    // Descending Y = top of page first (PDF y=0 is at bottom)
    const sortedYKeys = Array.from(yBuckets.keys()).sort((a, b) => b - a);

    for (const yKey of sortedYKeys) {
      const rowItems = yBuckets.get(yKey)!.sort((a, b) => a.x - b.x);
      const normalized = normalizeLine(rowItems.map((i) => i.str).join(" "));
      if (!normalized) continue;

      // Skip everything until we find the column header row
      if (!foundHeader) {
        if (/territory/i.test(normalized) && /release/i.test(normalized)) {
          foundHeader = true;
        }
        continue;
      }

      if (isNoise(normalized)) continue;

      const region = isRegionHeading(normalized);
      if (region) {
        currentRegion = region;
        if (!regionOrder.includes(region)) regionOrder.push(region);
        continue;
      }

      // Find rightmost item matching DATE_RE
      let dateIdx = -1;
      for (let i = rowItems.length - 1; i >= 0; i--) {
        if (DATE_RE.test(rowItems[i].str.trim())) {
          dateIdx = i;
          break;
        }
      }

      if (dateIdx > 0) {
        const territory = normalizeLine(
          rowItems
            .slice(0, dateIdx)
            .map((i) => i.str)
            .join(" "),
        );
        const dateRaw = rowItems[dateIdx].str.trim();
        if (territory && !isNoise(territory)) {
          rows.push({
            region: currentRegion,
            territory,
            ...normalizeDate(dateRaw),
          });
        }
      }
    }
  }

  return { rows, regionOrder };
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function extractPdfSchedulePositional(
  buffer: Buffer,
): Promise<ParseResult> {
  let allPageItems: PdfTextItem[][];
  try {
    allPageItems = await getPdfItems(buffer);
    console.log(
      `[extractPdfSchedule] loaded pages=${allPageItems.length} totalItems=${allPageItems.reduce((s, p) => s + p.length, 0)}`,
    );
  } catch (err) {
    console.error("[extractPdfSchedule] pdfjs load error", err);
    return { rows: [], warning: "no_rows_detected" };
  }

  const { rows, regionOrder } = positionalParse(allPageItems);
  const datedCount = rows.filter(
    (r) => r.date !== null || r.tba || r.no_release,
  ).length;

  console.log(
    `[extractPdfSchedule] positional rows=${rows.length} dated=${datedCount}`,
  );

  if (rows.length >= 5 || datedCount >= 2) {
    return { rows: sortItems(rows, regionOrder) };
  }

  // Fallback — concatenate raw text and run through the text parser
  console.log(
    "[extractPdfSchedule] positional insufficient — falling back to text parse",
  );
  const fullText = allPageItems
    .map((page) => page.map((i) => i.str).join("\n"))
    .join("\n\f\n");
  return parseReleaseSchedule(fullText);
}
