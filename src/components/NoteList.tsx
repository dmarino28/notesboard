import { NoteRow } from "@/lib/notes";
import { NoteItem } from "./NoteItem";

type Props = {
  notes: NoteRow[];
  loading: boolean;
  error: string | null;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, content: string) => Promise<void>;
};

export function NoteList({ notes, loading, error, onDelete, onUpdate }: Props) {
  if (loading) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-neutral-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-9 w-9"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.25}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-sm">No notes yet. Add one above.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <NoteItem key={n.id} note={n} onDelete={onDelete} onUpdate={onUpdate} />
      ))}
    </ul>
  );
}
