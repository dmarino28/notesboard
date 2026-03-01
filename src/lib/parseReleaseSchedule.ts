/**
 * parseReleaseSchedule.ts — Bucket 6C
 *
 * Pure text → ReleaseScheduleItem[] parser.
 * Receives the raw text extracted from a PDF (or pasted by the user) and returns
 * a sorted array of territory release schedule items.
 *
 * Strategy:
 *   1. Isolate the schedule block (starting near "Territory … Release Date").
 *   2. Primary parse: detect region headings; match territory + date on the same line.
 *   3. Fallback (blob-zip): territory tokens and date tokens appear in separate columns
 *      that the PDF extractor flattened into two separate text runs — zip by order.
 *   4. Normalize dates: dd-MMM-yy → ISO, TBA, No Release.
 *   5. Sort: region encounter order → date asc (null last) → territory alpha.
 */

import type { ReleaseScheduleItem } from "./boards";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// Known region headings (upper-case normalized for comparison)
const REGIONS = [
  "ASIA/PACIFIC",
  "ASIA PACIFIC",
  "LATIN AMERICA",
  "EUROPE",
  "MIDDLE EAST",
  "AFRICA",
  "NORTH AMERICA",
  "OTHER TERRITORIES",
  "OTHER",
  "DOMESTIC",
  "INTERNATIONAL",
  "EMEA",
  "APAC",
];

// Lines to drop unconditionally
const NOISE_RE = [
  /^\d+$/,                                          // bare page numbers
  /territory[\s\S]*release[\s\S]*date/i,            // column header repetitions
  /privileged|confidential|internal only|do not distribute/i,
  /page\s+\d+\s+of\s+\d+/i,
  /^©/,
  /^[-–—]+$/,                                       // separator lines
  /^\s*$/,                                          // empty after trim
];

// A token looks like a date if it matches one of these
const DATE_RE = /^(\d{1,2}-[A-Za-z]{3}-\d{2,4}|TBA|No\s+Release|N\/R)$/i;

// Primary-parse line: territory PLUS date on the same line (2+ spaces between them)
// Captures: [1] territory portion, [2] date token
const INLINE_RE =
  /^(.+?)\s{2,}(\d{1,2}-[A-Za-z]{3}-\d{2,4}|TBA|No\s+Release|N\/R)\s*$/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isRegionHeading(line: string): string | null {
  const up = line.toUpperCase().trim().replace(/\s+/g, " ");
  for (const r of REGIONS) {
    if (up === r || up === `${r}:` || up.startsWith(`${r} (`) || up.startsWith(`${r}:`)) {
      return r;
    }
  }
  return null;
}

function isNoise(line: string): boolean {
  return NOISE_RE.some((re) => re.test(line));
}

function normalizeDate(raw: string): Pick<ReleaseScheduleItem, "date" | "tba" | "no_release"> {
  const t = raw.trim();
  if (/^TBA$/i.test(t)) return { date: null, tba: true, no_release: false };
  if (/^(No\s+Release|N\/R)$/i.test(t)) return { date: null, tba: false, no_release: true };

  const m = t.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = MONTH_MAP[m[2].toLowerCase()];
    if (!month) return { date: null, tba: false, no_release: false };
    let year = m[3];
    if (year.length === 2) year = parseInt(year, 10) <= 50 ? `20${year}` : `19${year}`;
    return { date: `${year}-${month}-${day}`, tba: false, no_release: false };
  }

  return { date: null, tba: false, no_release: false };
}

function sortItems(
  items: ReleaseScheduleItem[],
  regionOrder: string[],
): ReleaseScheduleItem[] {
  return [...items].sort((a, b) => {
    // Region encounter order (null-region last)
    const ra = a.region ? regionOrder.indexOf(a.region) : Infinity;
    const rb = b.region ? regionOrder.indexOf(b.region) : Infinity;
    if (ra !== rb) return ra - rb;

    // Date ascending, null last
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;

    // Territory alpha
    return a.territory.localeCompare(b.territory);
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export function parseReleaseSchedule(rawText: string): ReleaseScheduleItem[] {
  // ── Step 1: Isolate the schedule block ──────────────────────────────────────
  // Find the line that contains "Territory" and some variant of "Release Date".
  // Everything before it is preamble (title, logos, etc.).
  const allLines = rawText.split("\n");

  let startIdx = 0;
  for (let i = 0; i < allLines.length; i++) {
    if (/territory/i.test(allLines[i]) && /release/i.test(allLines[i])) {
      startIdx = i + 1;
      break;
    }
    // Also accept a line that is just "Territory" followed shortly by a "Release Date" line
    if (/^territory\s*$/i.test(allLines[i].trim())) {
      startIdx = i + 1;
      break;
    }
  }

  const lines = allLines
    .slice(startIdx)
    .map((l) => l.trim())
    .filter((l) => !isNoise(l));

  // ── Step 2: Primary parse — territory + date on the same line ───────────────
  const primary: ReleaseScheduleItem[] = [];
  const regionOrder: string[] = [];
  let currentRegion: string | null = null;

  for (const line of lines) {
    const region = isRegionHeading(line);
    if (region) {
      currentRegion = region;
      if (!regionOrder.includes(region)) regionOrder.push(region);
      continue;
    }

    const m = line.match(INLINE_RE);
    if (m) {
      const territory = m[1].trim();
      const dateRaw = m[2].trim();
      primary.push({
        region: currentRegion,
        territory,
        ...normalizeDate(dateRaw),
      });
    }
  }

  // If primary parse found a meaningful set of entries, use it.
  // "Meaningful" = at least 2 dated (non-tba/no-release) or at least 5 entries total.
  const datedCount = primary.filter((r) => r.date !== null || r.tba || r.no_release).length;
  if (primary.length >= 5 || datedCount >= 2) {
    return sortItems(primary, regionOrder);
  }

  // ── Step 3: Blob-zip fallback ────────────────────────────────────────────────
  // In many PDFs the territory column and date column end up as separate text runs.
  // Collect territories and dates separately and zip by order.

  const territories: Array<{ territory: string; region: string | null }> = [];
  const dateTokens: string[] = [];
  const blobRegionOrder: string[] = [];
  let blobRegion: string | null = null;

  for (const line of lines) {
    // Multi-word lines that look like a date token
    if (DATE_RE.test(line.replace(/\s+/g, " "))) {
      dateTokens.push(line);
      continue;
    }

    const region = isRegionHeading(line);
    if (region) {
      blobRegion = region;
      if (!blobRegionOrder.includes(region)) blobRegionOrder.push(region);
      continue;
    }

    // Anything left that is not a bare number and has length > 1 is a territory candidate
    if (line.length > 1 && !/^\d+$/.test(line)) {
      territories.push({ territory: line, region: blobRegion });
    }
  }

  // Zip
  const zipped: ReleaseScheduleItem[] = [];
  const maxLen = Math.min(territories.length, dateTokens.length);
  for (let i = 0; i < maxLen; i++) {
    zipped.push({
      region: territories[i].region,
      territory: territories[i].territory,
      ...normalizeDate(dateTokens[i]),
    });
  }
  // Territories with no paired date (end of list)
  for (let i = maxLen; i < territories.length; i++) {
    zipped.push({
      region: territories[i].region,
      territory: territories[i].territory,
      date: null,
      tba: false,
      no_release: false,
    });
  }

  return sortItems(zipped, blobRegionOrder);
}
