"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Note = {
  id: string
  content: string
  created_at: string
}

export default function Home() {
  const [note, setNote] = useState("")
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(false)

  const loadNotes = async () => {
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error(error)
      alert("Error loading notes")
      return
    }

    setNotes(data ?? [])
  }

  const addNote = async () => {
    if (!note.trim()) return

    setLoading(true)

    const { error } = await supabase.from("notes").insert([{ content: note }])

    setLoading(false)

    if (error) {
      console.error(error)
      alert("Error adding note")
      return
    }

    setNote("")
    loadNotes()
  }

  useEffect(() => {
    loadNotes()
  }, [])

  return (
    <div style={{ padding: 40, maxWidth: 700 }}>
      <h1>NotesBoard</h1>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Write a note..."
          style={{ padding: 8, flex: 1 }}
        />
        <button onClick={addNote} disabled={loading}>
          {loading ? "Adding..." : "Add"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {notes.map((n) => (
          <div
            key={n.id}
            style={{
              border: "1px solid #333",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 16 }}>{n.content}</div>
            <div style={{ opacity: 0.6, fontSize: 12, marginTop: 6 }}>
              {new Date(n.created_at).toLocaleString()}
            </div>
          </div>
        ))}

        {notes.length === 0 && (
          <div style={{ opacity: 0.7 }}>No notes yet.</div>
        )}
      </div>
    </div>
  )
}
