import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { reportError } from "@/lib/errors";
import { supabaseAdmin, supabaseForToken } from "@/lib/supabase";

/*
  The desk's two GoTrue operations: changing the address a member signs in with, and closing an
  account. Both need the service role (a reader's own token can never administer another
  account), so they live here rather than in a database function, and the caller is verified the
  same way the rest of the site verifies the desk — the database's own is_admin(), on the
  caller's token. The route never renders a provider message: GoTrue's refusals are matched by
  shape and answered with fixed Bengali text.
*/
const SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Params = { params: Promise<{ id: string }> };

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** The caller's own id, once the database has said they are an administrator. */
async function requireAdmin(): Promise<string | NextResponse> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      {
        cookieOptions: {
          path: "/",
          sameSite: "lax",
          httpOnly: false,
          maxAge: SESSION_MAX_AGE_SECONDS,
        },
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (
            toSet: { name: string; value: string; options?: object }[],
          ) => {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, {
                path: "/",
                sameSite: "lax",
                httpOnly: false,
                maxAge: SESSION_MAX_AGE_SECONDS,
                ...options,
              });
            }
          },
        },
      },
    );
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return json({ error: "এই কাজের জন্য আগে প্রবেশ করুন।" }, 401);
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return json({ error: "এই কাজের জন্য আগে প্রবেশ করুন।" }, 401);
    }
    const { data: admin, error: roleError } = await supabaseForToken(
      session.access_token,
    ).rpc("is_admin");
    if (roleError || !admin) {
      return json({ error: "কেবল অ্যাডমিনরা এটি করতে পারেন।" }, 403);
    }
    return data.user.id;
  } catch (error) {
    reportError("admin member route", error);
    return json({ error: "অনুমতি যাচাই করা যায়নি। আবার চেষ্টা করুন।" }, 500);
  }
}

export async function PATCH(request: Request, context: Params) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return json({ error: "সদস্যটি চিহ্নিত করা যায়নি।" }, 400);
  }
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
  } | null;
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return json({ error: "সঠিক ইমেইল ঠিকানা লিখুন।" }, 400);
  }
  try {
    // The new address applies at once: no confirmation round-trip for a change the desk made.
    const { data, error } = await supabaseAdmin().auth.admin.updateUserById(id, {
      email,
      email_confirm: true,
    });
    if (error) {
      const message = String(error?.message ?? "");
      const taken = /already|registered|duplicate|unique constraint/i.test(
        message,
      );
      return json(
        {
          error: taken
            ? "এই ইমেইলে ইতোমধ্যে আরেকটি অ্যাকাউন্ট আছে।"
            : "ইমেইল পরিবর্তন করা যায়নি। আবার চেষ্টা করুন।",
        },
        400,
      );
    }
    return json({ ok: true, email: data.user?.email ?? email });
  } catch (error) {
    reportError("admin email change", error);
    return json({ error: "ইমেইল পরিবর্তন করা যায়নি। আবার চেষ্টা করুন।" }, 500);
  }
}

export async function DELETE(request: Request, context: Params) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return json({ error: "সদস্যটি চিহ্নিত করা যায়নি।" }, 400);
  }
  if (id === gate) {
    return json({ error: "নিজের অ্যাকাউন্ট এই পথে বন্ধ করা যায় না।" }, 400);
  }
  try {
    // A soft delete: the member can never sign in again, their writing and money stay in place.
    const { error } = await supabaseAdmin().auth.admin.deleteUser(id, true);
    if (error) {
      return json({ error: "অ্যাকাউন্ট বন্ধ করা যায়নি। আবার চেষ্টা করুন।" }, 400);
    }
    return json({ ok: true });
  } catch (error) {
    reportError("admin account close", error);
    return json({ error: "অ্যাকাউন্ট বন্ধ করা যায়নি। আবার চেষ্টা করুন।" }, 500);
  }
}
