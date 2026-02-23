import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabaseAuthed";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client, user } = auth;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};
  let oldName: string | null = null;

  if (typeof body?.name === "string") {
    const newName = body.name.trim();
    if (!newName) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });

    const { data: existing } = await client
      .from("action_tag_defs")
      .select("name")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    oldName = existing.name;
    updates.name = newName;
  }

  if (typeof body?.sort_order === "number") {
    updates.sort_order = body.sort_order;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await client
    .from("action_tag_defs")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, sort_order, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Propagate rename into note_user_actions.private_tags
  if (oldName !== null && typeof updates.name === "string" && oldName !== updates.name) {
    await client.rpc("replace_action_tag", {
      p_user_id: user.id,
      p_old_name: oldName,
      p_new_name: updates.name,
    });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client, user } = auth;
  const { id } = await params;

  const { data: existing } = await client
    .from("action_tag_defs")
    .select("name")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await client
    .from("action_tag_defs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Remove tag from all note_user_actions.private_tags for this user
  await client.rpc("remove_action_tag", {
    p_user_id: user.id,
    p_tag_name: existing.name,
  });

  return NextResponse.json({ deleted: true });
}
