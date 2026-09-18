export const runtime = "edge";

import { NextRequest } from "next/server";
import { json, jsonError, hasSupabase } from "@/lib/data/deskApi";
import { listPolls, createPoll, updatePoll, deletePoll } from "@/lib/data/adminMock";

/**
 * GET    /api/admin/polls — list all polls.
 * POST   /api/admin/polls — create a new poll.
 * PATCH  /api/admin/polls — update a poll by { id, ...patch }.
 * DELETE /api/admin/polls?id=... — delete a poll.
 */

export async function GET() {
  if (hasSupabase()) {
    const { requireModerator } = await import("@/lib/auth/admin");
    const ctx = await requireModerator();
    if (!ctx) return jsonError("Moderator+ role required", 403);

    const { data, error } = await ctx.supabase
      .from("polls")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return jsonError(error.message, 500);
    return json({ polls: data ?? [] });
  }

  return json({ polls: listPolls() });
}

export async function POST(request: NextRequest) {
  let body: {
    question_bn?: string;
    question_en?: string;
    options?: { label_bn: string; label_en: string }[];
    is_active?: boolean;
    ends_at?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  if (!body.question_bn || !body.question_en || !body.options?.length) {
    return jsonError("`question_bn`, `question_en`, and `options` are required");
  }

  if (hasSupabase()) {
    const { requireModerator } = await import("@/lib/auth/admin");
    const ctx = await requireModerator();
    if (!ctx) return jsonError("Moderator+ role required", 403);

    const options = body.options.map((o, i) => ({
      id: `opt-${Date.now().toString(36)}-${i}`,
      ...o,
      votes: 0,
    }));
    const { data, error } = await ctx.supabase
      .from("polls")
      .insert({
        question: body.question_bn,
        options,
        is_active: body.is_active ?? true,
        ends_at: body.ends_at ?? null,
      })
      .select("*")
      .single();
    if (error) return jsonError(error.message, 500);
    return json({ poll: data }, { status: 201 });
  }

  const options = body.options!.map((o, i) => ({
    id: `opt-${Date.now().toString(36)}-${i}`,
    label_bn: o.label_bn,
    label_en: o.label_en,
    votes: 0,
  }));
  const poll = createPoll({
    question_bn: body.question_bn!,
    question_en: body.question_en!,
    options,
    is_active: body.is_active ?? true,
    ends_at: body.ends_at ?? null,
  });
  return json({ poll }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  let body: { id?: string; [key: string]: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }
  if (!body.id) return jsonError("`id` is required");

  if (hasSupabase()) {
    const { requireModerator } = await import("@/lib/auth/admin");
    const ctx = await requireModerator();
    if (!ctx) return jsonError("Moderator+ role required", 403);

    const { id, ...patch } = body;
    if (patch.options && typeof patch.options === "object") {
      patch.options = JSON.stringify(patch.options);
    }
    const { data, error } = await ctx.supabase.from("polls").update(patch).eq("id", id).select("*").single();
    if (error) return jsonError(error.message, 500);
    return json({ poll: data });
  }

  const { id, ...patch } = body;
  const updated = updatePoll(id, patch as Parameters<typeof updatePoll>[1]);
  if (!updated) return jsonError("Poll not found", 404);
  return json({ poll: updated });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return jsonError("`id` query param is required");

  if (hasSupabase()) {
    const { requireModerator } = await import("@/lib/auth/admin");
    const ctx = await requireModerator();
    if (!ctx) return jsonError("Moderator+ role required", 403);

    const { error } = await ctx.supabase.from("polls").delete().eq("id", id);
    if (error) return jsonError(error.message, 500);
    return json({ deleted: true });
  }

  const ok = deletePoll(id);
  if (!ok) return jsonError("Poll not found", 404);
  return json({ deleted: true });
}
