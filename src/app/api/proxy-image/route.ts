import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  // Only allow Firebase Storage URLs
  if (!url.includes("firebasestorage.googleapis.com") && !url.includes("storage.googleapis.com")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 403 });
  }

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      return NextResponse.json({ error: "Failed to fetch" }, { status: resp.status });
    }

    const contentType = resp.headers.get("content-type") || "image/png";
    const buffer = await resp.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}
