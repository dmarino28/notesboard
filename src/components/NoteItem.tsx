import { NoteRow } from "@/lib/notes";

export function NoteItem({ note }: { note: NoteRow }) {
  return (
    <li className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
      <p className="whitespace-pre-wrap text-sm">{note.content}</p>
      <p className="mt-2 text-xs text-neutral-500">
        {new Date(note.created_at).toLocaleString()}
      </p>
    </li>
  );
}
