import { NextResponse } from "next/server";
import { auth, createClerkClient } from "@clerk/nextjs/server";

export const ADMIN_KEY_HEADER = "X-Admin-Key";

/**
 * Verify a server-only admin credential against the X-Admin-Key header,
 * the Authorization: Bearer header, or the Vercel cron secret.
 *
 * CRITICAL: Never reference a NEXT_PUBLIC_* variable here. Admin credentials
 * must never be exposed to the client bundle.
 *
 * Returns null if valid, or a NextResponse with 401 if invalid.
 */
export function verifyAdminKey(request: Request): NextResponse | null {
  const headerKey = request.headers.get(ADMIN_KEY_HEADER);
  const bearerKey = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");

  const adminKey = process.env.ADMIN_API_KEY;
  const cronSecret = process.env.CRON_SECRET;

  if (adminKey && headerKey === adminKey) return null;
  if (adminKey && bearerKey && bearerKey === adminKey) return null;
  if (cronSecret && bearerKey && bearerKey === cronSecret) return null;

  return NextResponse.json({ detail: "Unauthorized - Invalid admin credentials" }, { status: 401 });
}

/**
 * Authorize a request as admin via (1) a server-only admin key/cron secret or
 * (2) a Clerk session whose user has publicMetadata.role === "admin".
 *
 * Use this in admin API routes so the client never needs to hold an admin key.
 */
export async function authorizeAdmin(request: Request): Promise<NextResponse | null> {
  const keyCheck = verifyAdminKey(request);
  if (!keyCheck) return null;

  try {
    const session = await auth();
    if (session?.userId) {
      const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" });
      const user = await client.users.getUser(session.userId);
      if ((user.publicMetadata as Record<string, unknown> | null | undefined)?.role === "admin") {
        return null;
      }
    }
  } catch (error) {
    console.error("Clerk admin check failed:", error);
  }

  return keyCheck;
}

/**
 * Check if a Clerk user is an admin (server-side).
 */
export function isUserAdmin(publicMetadata?: Record<string, unknown>): boolean {
  return publicMetadata?.role === "admin";
}