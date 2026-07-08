import { NextResponse } from "next/server";

/**
 * Verify the X-Admin-Key header matches the expected admin API key.
 * Returns null if valid, or a NextResponse with 401 if invalid.
 */
export function verifyAdminKey(request: Request): NextResponse | null {
  const adminKeyHeader = request.headers.get("X-Admin-Key");
  const expectedKey = process.env.ADMIN_API_KEY || process.env.NEXT_PUBLIC_ADMIN_API_KEY;

  if (!adminKeyHeader || adminKeyHeader !== expectedKey) {
    return NextResponse.json({ detail: "Unauthorized - Invalid X-Admin-Key" }, { status: 401 });
  }
  return null;
}

/**
 * Check if a user has admin access (server-side via Clerk metadata or env var presence).
 */
export function isUserAdmin(publicMetadata?: Record<string, unknown>): boolean {
  return publicMetadata?.role === "admin" || Boolean(process.env.ADMIN_API_KEY || process.env.NEXT_PUBLIC_ADMIN_API_KEY);
}

export const ADMIN_KEY_HEADER = "X-Admin-Key";
