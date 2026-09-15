import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Return empty — categories are loaded via server layout anyway
    return NextResponse.json([]);
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/categories?select=*&is_active=eq.true&order=sort_order.asc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      },
    );

    if (!res.ok) return NextResponse.json([]);
    const items = await res.json();
    return NextResponse.json(items);
  } catch {
    return NextResponse.json([]);
  }
}
