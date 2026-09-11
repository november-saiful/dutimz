import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AUTH } from "@/lib/auth/config";

/** Sign out (POST only so prefetches cannot log users out) and go home. */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();

  const origin = request.nextUrl.origin;
  return NextResponse.redirect(`${origin}${AUTH.homePath}`, {
    status: 302,
  });
}
