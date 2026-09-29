import { NextResponse } from "next/server";

export async function GET() {
  const demoFlag = process.env.NEXT_PUBLIC_DEMO_MODE;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return NextResponse.json(
    {
      supabaseUrl,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      mediaUrl: process.env.NEXT_PUBLIC_MEDIA_URL ?? "",
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
