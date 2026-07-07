import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Daily digest: collects all new permits from the last 24h and sends ONE email per subscriber
export async function GET() {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Find all active subscribers with their territory and recent filings
    const subscribers = await db.execute(sql`
      SELECT
        s.id,
        s.email,
        s.business_name,
        s.filing_type_filters,
        ST_AsGeoJSON(s.service_area) as service_area
      FROM subscribers s
      WHERE s.status = 'active' AND s.email IS NOT NULL
    `);

    let totalEmailsSent = 0;
    const report: any[] = [];

    for (const sub of subscribers) {
      const subscriberId = sub.id as string;
      const email = sub.email as string;
      const businessName = sub.business_name as string;
      const filingFilters = sub.filing_type_filters as string[];
      const serviceArea = sub.service_area as string;

      if (!email || !serviceArea) continue;

      // Find permits inside this subscriber's territory from last 24h
      const permits = await db.execute(sql`
        SELECT
          f.id,
          f.filing_type,
          f.address_raw,
          f.filed_at,
          ST_X(f.geom::geometry) as lng,
          ST_Y(f.geom::geometry) as lat
        FROM filings f
        WHERE ST_Contains(ST_GeomFromGeoJSON(${serviceArea}), f.geom)
          AND f.filed_at >= ${since}
          AND f.filing_type = ANY(${filingFilters})
        ORDER BY f.filed_at DESC
        LIMIT 50
      `);

      if (permits.length === 0) continue;

      // Build digest email
      const permitRows = permits.map((p: any) => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 12px; font-weight: 500;">${p.filing_type === "building_permit" ? "Building Permit" : "Business License"}</td>
          <td style="padding: 8px 12px;">${p.address_raw}</td>
          <td style="padding: 8px 12px; color: #6b7280;">${new Date(p.filed_at).toLocaleDateString()}</td>
        </tr>
      `).join("");

      const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="border-bottom: 2px solid #0d9488; padding-bottom: 10px; margin-bottom: 20px;">
            <h2 style="color: #0f766e; margin: 0;">Portafor Daily Digest</h2>
          </div>
          <p>Hello <strong>${businessName}</strong>,</p>
          <p>Here are the <strong>${permits.length} new permit${permits.length > 1 ? "s" : ""}</strong> filed in your territory in the last 24 hours:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background-color: #f0fdfa; text-align: left;">
                <th style="padding: 8px 12px; font-weight: 600;">Type</th>
                <th style="padding: 8px 12px; font-weight: 600;">Address</th>
                <th style="padding: 8px 12px; font-weight: 600;">Date</th>
              </tr>
            </thead>
            <tbody>
              ${permitRows}
            </tbody>
          </table>
          <p style="font-size: 13px; color: #6b7280;">Each of these filings represents a homeowner or business that may need your services. Reach out while the permit is fresh!</p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="https://www.portafor.info/dashboard" style="background-color: #0d9488; color: white; padding: 10px 24px; text-decoration: none; border-radius: 8px; font-weight: 500;">View in Dashboard</a>
          </div>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
            This is your daily digest from Portafor. You receive this because you have email alerts enabled.
          </p>
        </body>
      </html>`;

      const textBody = `Portafor Daily Digest\n\nHello ${businessName},\n\n${permits.length} new permit(s) in your territory:\n\n${permits.map((p: any) => `- ${p.filing_type}: ${p.address_raw} (${new Date(p.filed_at).toLocaleDateString()})`).join("\n")}\n\nView in dashboard: https://www.portafor.info/dashboard`;

      // Send digest email
      try {
        if (process.env.RESEND_API_KEY) {
          const senderEmail = process.env.SENDER_EMAIL || "digest@portafor.info";
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`
            },
            body: JSON.stringify({
              from: senderEmail,
              to: email,
              subject: `[Portafor Digest] ${permits.length} new permit${permits.length > 1 ? "s" : ""} in your territory`,
              html: htmlBody,
              text: textBody
            })
          });
        } else {
          console.log(`[Digest Mock] To: ${email} | ${permits.length} permits`);
        }
        totalEmailsSent++;
        report.push({ subscriber: businessName, permits: permits.length, status: "sent" });
      } catch (emailErr) {
        console.error(`Failed to send digest to ${email}:`, emailErr);
        report.push({ subscriber: businessName, permits: permits.length, status: "failed" });
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      subscribersProcessed: subscribers.length,
      emailsSent: totalEmailsSent,
      details: report
    });
  } catch (error) {
    console.error("Digest job failed:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
