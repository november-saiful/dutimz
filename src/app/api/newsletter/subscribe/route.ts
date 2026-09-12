import { NextResponse, type NextRequest } from "next/server";
import { subscribeNewsletter } from "@/lib/data/publicMock";

/** POST /api/newsletter/subscribe — subscribe to the newsletter */
export async function POST(request: NextRequest) {
  const { email, locale } = await request.json();

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json(
      { error: "A valid email is required" },
      { status: 400 },
    );
  }

  const result = subscribeNewsletter(email.trim().toLowerCase(), locale ?? "bn");
  return NextResponse.json(result);
}
