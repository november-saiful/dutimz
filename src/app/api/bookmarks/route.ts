import { NextResponse, type NextRequest } from "next/server";
import { toggleBookmark, getBookmarkIds } from "@/lib/data/publicMock";

/** POST /api/bookmarks — toggle a bookmark (mock: uses "demo-user" as user ID) */
export async function POST(request: NextRequest) {
  const { contentId } = await request.json();
  if (!contentId) {
    return NextResponse.json({ error: "contentId is required" }, { status: 400 });
  }
  // Mock: use a fixed user ID since we don't have auth wired client-side
  const userId = "demo-user";
  const bookmarked = toggleBookmark(userId, contentId);
  return NextResponse.json({ bookmarked });
}

/** GET /api/bookmarks — list bookmarked content IDs for the current user */
export async function GET() {
  const userId = "demo-user";
  const ids = getBookmarkIds(userId);
  return NextResponse.json({ contentIds: ids });
}
