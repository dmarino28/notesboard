/**
 * parseReleaseSchedule.ts — Bucket 6C
 *
 * Pure text → ParseResult parser.
 * Receives the raw text extracted from a PDF (or pasted by the user) and returns
 * a sorted array of territory release schedule items.
 *
 * Strategy:
 *   1. Isolate the schedule block (starting near "Territory … Release Date").
 *   2. Normalize whitespace; strip control characters; apply noise filter.
 *   3. Primary parse: detect region headings; match territory + date on the same line.
 *   4. Fallback (blob-zip): territory tokens and date tokens appear in separate columns.
 *      Requires exact count match — returns mismatch_counts warning if they differ.
 *   5. Normalize dates: dd-MMM-yy → ISO, TBA, No Release.
 *   6. Sort: region encounter order → date asc (null last) → territory alpha.
 */

import type { ReleaseScheduleItem } from "./boards";

export type ParseResult = {
  rows: ReleaseScheduleItem[];
  warning?: "no_rows_detected" | "mismatch_counts";
};

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

// Lines to drop unconditionally — applied after whitespace normalization.
const NOISE_RE = [
  /^\d+$/,                                           // bare page numbers
  /territory[\s\S]*release[\s\S]*date/i,             // column header repetitions
  /privileged|confidential|internal only|do not distribute/i,
  /page\s+\d+\s+of\s+\d+/i,                         // "Page 1 of 4"
  /^page\s+\d+/i,                                    // "Page 1"
  /^©/,
  /^[-–—]+$/,                                        // separator lines
  /^\s*$/,                                           // empty after trim
  /international release schedule/i,                 // document title header
  /prepared\s+on/i,                                  // "Prepared on dd-MMM-yy"
  /^[>^*]/,                                          // legend / annotation prefixes (> = changed, ^ = note, * = asterisk)
  /=\s*released/i,                                   // "R = Released" legend lines
  /^(region|territory|release\s+date)$/i,            // lone column header words
];

// A token is a valid date value (used in blob-zip date column)
export const DATE_RE = /^(\d{1,2}-[A-Za-z]{3}-\d{2,4}|TBA|No\s+Release|N\/R)$/i;

// Primary-parse: territory PLUS date on the same line (2+ spaces or tab between them)
// Captures: [1] territory portion, [2] date token
const INLINE_RE =
  /^(.+?)\s{2,}(\d{1,2}-[A-Za-z]{3}-\d{2,4}|TBA|No\s+Release|N\/R)\s*$/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

export function normalizeLine(raw: string): string {
  // Strip control characters, collapse internal whitespace, trim
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRegionHeading(line: string): string | null {
  const up = line.toUpperCase().trim().replace(/\s+/g, " ");
  for (const r of REGIONS) {
    if (up === r || up === `${r}:` || up.startsWith(`${r} (`) || up.startsWith(`${r}:`)) {
      return r;
    }
  }
  return null;
}

export function isNoise(line: string): boolean {
  return NOISE_RE.some((re) => re.test(line));
}

// A line that looks purely like a date token (used to exclude from territory candidates)
function isDateToken(line: string): boolean {
  return DATE_RE.test(line);
}

export function normalizeDate(raw: string): Pick<ReleaseScheduleItem, "date" | "tba" | "no_release"> {
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

export function sortItems(
  items: ReleaseScheduleItem[],
  regionOrder: string[],
): ReleaseScheduleItem[] {
  return [...items].sort((a, b) => {
    const ra = a.region ? regionOrder.indexOf(a.region) : Infinity;
    const rb = b.region ? regionOrder.indexOf(b.region) : Infinity;
    if (ra !== rb) return ra - rb;

    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;

    return a.territory.localeCompare(b.territory);
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export function parseReleaseSchedule(rawText: string): ParseResult {
  // ── Step 1: Isolate the schedule block ──────────────────────────────────────
  // Find the line that contains "Territory" and some variant of "Release Date".
  // Everything before it is preamble (title, logos, document header, etc.).
  const allLines = rawText.split("\n");

  let startIdx = 0;
  for (let i = 0; i < allLines.length; i++) {
    if (/territory/i.test(allLines[i]) && /release/i.test(allLines[i])) {
      startIdx = i + 1;
      break;
    }
    if (/^territory\s*$/i.test(allLines[i].trim())) {
      startIdx = i + 1;
      break;
    }
  }

  // ── Step 2: Normalize and filter ────────────────────────────────────────────
  const lines = allLines
    .slice(startIdx)
    .map(normalizeLine)
    .filter((l) => l.length > 0 && !isNoise(l));

  // ── Step 3: Primary parse — territory + date on the same line ───────────────
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

  // Promote primary results if they look meaningful
  const datedCount = primary.filter((r) => r.date !== null || r.tba || r.no_release).length;
  if (primary.length >= 5 || datedCount >= 2) {
    return { rows: sortItems(primary, regionOrder) };
  }

  // ── Step 4: Blob-zip fallback ────────────────────────────────────────────────
  // Territory column and date column were flattened into separate text runs.
  // Collect each list strictly, then require exact count match before zipping.

  const territories: Array<{ territory: string; region: string | null }> = [];
  const dateTokens: string[] = [];
  const blobRegionOrder: string[] = [];
  let blobRegion: string | null = null;

  for (const line of lines) {
    // Date column — only exact date-shaped tokens
    if (isDateToken(line)) {
      dateTokens.push(line);
      continue;
    }

    const region = isRegionHeading(line);
    if (region) {
      blobRegion = region;
      if (!blobRegionOrder.includes(region)) blobRegionOrder.push(region);
      continue;
    }

    // Territory candidate: non-empty, not a bare number, not a date token (guard),
    // not noise (already filtered from `lines`, but isNoise guard is cheap)
    if (line.length > 1 && !/^\d+$/.test(line) && !isDateToken(line) && !isNoise(line)) {
      territories.push({ territory: line, region: blobRegion });
    }
  }

  // Strict count check — unequal counts mean the columns didn't align cleanly.
  // Zipping blindly here produces wrong territory↔date pairings (or noise entries).
  if (territories.length !== dateTokens.length) {
    return { rows: [], warning: "mismatch_counts" };
  }

  if (territories.length === 0) {
    return { rows: [], warning: "no_rows_detected" };
  }

  const zipped: ReleaseScheduleItem[] = territories.map((t, i) => ({
    region: t.region,
    territory: t.territory,
    ...normalizeDate(dateTokens[i]),
  }));

  return { rows: sortItems(zipped, blobRegionOrder) };
}
