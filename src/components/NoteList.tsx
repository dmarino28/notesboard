import { NoteRow } from "@/lib/notes";
import { NoteItem } from "./NoteItem";

type Props = {
  notes: NoteRow[];
  loading: boolean;
  error: string | null;
};

export function NoteList({ notes, loading, error }: Props) {
  if (loading) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (notes.length === 0) {
    return <p className="text-sm text-neutral-400">No notes yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <NoteItem key={n.id} note={n} />
      ))}
    </ul>
  );
}
