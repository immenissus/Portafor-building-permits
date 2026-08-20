import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.redirect(new URL("/sitemap.xml", "https://www.portafor.info"), 301);
}
