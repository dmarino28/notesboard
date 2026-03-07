import { supabase } from "./supabase";

export type NoteAttachmentRow = {
  id: string;
  note_id: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  created_by: string;
  created_at: string;
};

const NOTE_ATTACHMENT_SELECT =
  "id, note_id, storage_path, file_name, file_size, mime_type, created_by, created_at";

const BUCKET = "note-attachments";

export async function listNoteAttachments(
  noteId: string,
): Promise<{ data: NoteAttachmentRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("note_attachments")
    .select(NOTE_ATTACHMENT_SELECT)
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });
  return { data: (data ?? []) as NoteAttachmentRow[], error: error?.message ?? null };
}

/**
 * Uploads a file to Supabase Storage then inserts a metadata row.
 * Storage path: {noteId}/{uuid}.{ext}
 * If the metadata insert fails, the orphaned storage object is cleaned up.
 */
export async function uploadNoteAttachment(
  noteId: string,
  file: File,
): Promise<{ data: NoteAttachmentRow | null; error: string | null }> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const storagePath = `${noteId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined });

  if (uploadError) return { data: null, error: uploadError.message };

  const { data, error: insertError } = await supabase
    .from("note_attachments")
    .insert({
      note_id: noteId,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
    })
    .select(NOTE_ATTACHMENT_SELECT)
    .single();

  if (insertError) {
    // Best-effort cleanup of the orphaned storage object
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { data: null, error: insertError.message };
  }

  return { data: data as NoteAttachmentRow, error: null };
}

/**
 * Deletes the metadata row then the storage object.
 * DB delete is the authoritative step (RLS enforces created_by).
 * Storage delete is best-effort; a failed storage delete is logged but not surfaced.
 */
export async function deleteNoteAttachment(
  id: string,
  storagePath: string,
): Promise<{ error: string | null }> {
  const { error: dbError } = await supabase
    .from("note_attachments")
    .delete()
    .eq("id", id);

  if (dbError) return { error: dbError.message };

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath]);

  if (storageError) {
    console.error("[deleteNoteAttachment] storage remove failed:", storageError.message);
  }

  return { error: null };
}
