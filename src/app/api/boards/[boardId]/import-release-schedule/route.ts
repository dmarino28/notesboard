import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import { parseReleaseSchedule } from "@/lib/parseReleaseSchedule";
import { extractPdfSchedulePositional } from "@/lib/extractPdfSchedule";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DEV = process.env.NODE_ENV === "development";

// ── Structured error helper ───────────────────────────────────────────────────

function errJson(
  status: number,
  error_code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json({ error_code, message, details: details ?? null }, { status });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> },
) {
  const auth = await getAuthedSupabase(req);
  if (!auth) {
    return errJson(401, "unauthorized", "Authentication required");
  }
  const { client } = auth;
  const { boardId } = await params;

  const contentType = req.headers.get("content-type") ?? "";
  console.log(`[import-release-schedule] boardId=${boardId} content-type=${contentType}`);

  // ── Branch on content type ────────────────────────────────────────────────

  let parseResult: ReturnType<typeof parseReleaseSchedule>;

  if (contentType.startsWith("text/plain")) {
    // Paste-text path — raw text straight through the text parser
    const rawText = await req.text();
    console.log(`[import-release-schedule] paste path textLength=${rawText.length}`);
    parseResult = parseReleaseSchedule(rawText);

  } else if (contentType.startsWith("application/json")) {
    // JSON { text } path
    let body: { text?: string };
    try {
      body = (await req.json()) as { text?: string };
    } catch {
      return errJson(400, "invalid_json", "Request body is not valid JSON");
    }
    if (!body.text || typeof body.text !== "string") {
      return errJson(400, "missing_text", "JSON body must include a non-empty 'text' field");
    }
    console.log(`[import-release-schedule] json path textLength=${body.text.length}`);
    parseResult = parseReleaseSchedule(body.text);

  } else {
    // Multipart PDF upload path
    if (!contentType.startsWith("multipart/form-data")) {
      return errJson(
        415,
        "unsupported_content_type",
        `Expected multipart/form-data, text/plain, or application/json. Got: ${contentType || "(none)"}`,
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch (err) {
      console.error("[import-release-schedule] formData parse error", err);
      return errJson(400, "form_parse_error", "Could not parse multipart form data");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return errJson(400, "missing_file", "Form must include a 'file' field with the PDF");
    }
    if (file.size === 0) {
      return errJson(400, "empty_file", "The uploaded file is empty");
    }
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return errJson(
        400,
        "not_pdf",
        `Only PDF files are accepted. Received type: "${file.type}", name: "${file.name}"`,
      );
    }
    if (file.size > MAX_BYTES) {
      return errJson(400, "file_too_large", `File exceeds the 10 MB limit (got ${(file.size / 1048576).toFixed(1)} MB)`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    console.log(`[import-release-schedule] PDF upload size=${buffer.length}B name="${file.name}"`);

    try {
      parseResult = await extractPdfSchedulePositional(buffer);
    } catch (err) {
      console.error("[import-release-schedule] PDF extraction error", err);
      return errJson(
        422,
        "pdf_extraction_failed",
        "Could not extract text from this PDF. The file may be scanned/image-only. Try the Paste text fallback.",
        DEV ? { extractionError: String(err) } : undefined,
      );
    }
  }

  // ── Parse result ──────────────────────────────────────────────────────────

  const { rows, warning: parseWarning } = parseResult;
  console.log(`[import-release-schedule] rows=${rows.length} warning=${parseWarning ?? "none"}`);

  // Warning or 0 rows: return 200 without overwriting the existing schedule.
  if (parseWarning || rows.length === 0) {
    console.warn(`[import-release-schedule] not saved — warning=${parseWarning ?? "no_rows_detected"}`);
    return NextResponse.json({
      rows: [],
      count: 0,
      warning: parseWarning ?? "no_rows_detected",
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const { error } = await client
    .from("boards")
    .update({ release_schedule: rows })
    .eq("id", boardId);

  if (error) {
    console.error("[import-release-schedule] DB write error", error);
    return errJson(500, "db_error", error.message);
  }

  console.log(`[import-release-schedule] saved rows=${rows.length} boardId=${boardId}`);
  return NextResponse.json({ rows, count: rows.length });
}
