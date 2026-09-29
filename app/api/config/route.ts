import { NextResponse } from "next/server";

import { MEDIA_URL } from "@/lib/site";

export async function GET() {
  const demoFlag = process.env.NEXT_PUBLIC_DEMO_MODE;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return NextResponse.json(
    {
      supabaseUrl,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      // The resolved constant, not the raw variable: this value is built once, and the
      // release check refuses to pass while it is empty.
      mediaUrl: MEDIA_URL,
      demoMode:
        demoFlag === undefined || demoFlag === ""
          ? !supabaseUrl
          : demoFlag !== "false",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
