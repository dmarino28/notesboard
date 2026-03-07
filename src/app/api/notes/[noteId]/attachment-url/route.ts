import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";
import { createServiceRoleClient } from "@/lib/supabaseServer";

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour
const BUCKET = "note-attachments";

/**
 * GET /api/notes/[noteId]/attachment-url?id={attachmentId}
 *
 * Returns a short-lived signed URL for a note attachment.
 *
 * Access control:
 *   1. Caller must be authenticated (getAuthedSupabase).
 *   2. The note_attachments row is fetched using the caller's user client,
 *      which runs through RLS — if the row isn't visible to this user the
 *      lookup returns nothing and we 404.
 *   3. We additionally verify the row belongs to the noteId in the URL path
 *      to prevent ID-substitution attacks.
 *   4. Only after both checks pass do we use the service role client to
 *      generate the signed URL (which bypasses storage SELECT RLS).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client } = auth;

  const { noteId } = await params;
  const attachmentId = req.nextUrl.searchParams.get("id");
  if (!attachmentId) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  // Fetch the attachment row using the user's client (subject to RLS).
  // This verifies the user has access to the parent note AND the row exists.
  const { data: row, error: lookupError } = await client
    .from("note_attachments")
    .select("id, note_id, storage_path")
    .eq("id", attachmentId)
    .eq("note_id", noteId) // path-param guard — prevents cross-note ID substitution
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Generate signed URL via service role (bypasses storage SELECT policy).
  const adminClient = createServiceRoleClient();
  const { data: signedData, error: signedError } = await adminClient.storage
    .from(BUCKET)
    .createSignedUrl(
      (row as { storage_path: string }).storage_path,
      SIGNED_URL_EXPIRY_SECONDS,
    );

  if (signedError || !signedData?.signedUrl) {
    console.error("[attachment-url] signed URL error:", signedError?.message);
    return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: signedData.signedUrl });
}
