import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { authorizeAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Daily digest: sends ONE email per subscriber with all undelivered permits from today
export async function GET(request: Request) {
  try {
    const authError = await authorizeAdmin(request);
    if (authError) return authError;

    // Start of today (UTC)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // Find all active subscribers with undigested alerts
    const subscribersWithAlerts = await db.execute(sql`
      SELECT DISTINCT
        s.id,
        s.email,
        s.business_name,
        s.market
      FROM subscribers s
      INNER JOIN alerts_sent a ON a.subscriber_id = s.id
      WHERE s.status = 'active'
        AND s.email IS NOT NULL
        AND a.digested = false
    `);

    let totalEmailsSent = 0;
    const report: Array<Record<string, unknown>> = [];

    for (const sub of subscribersWithAlerts) {
      const subscriberId = sub.id as string;
      const email = sub.email as string;
      const businessName = sub.business_name as string;

      if (!email) continue;

      // Get all undigested permits for this subscriber, with jurisdiction name and filing details
      const permits = await db.execute(sql`
        SELECT
          f.external_id,
          f.filing_type,
          f.address_raw,
          f.filed_at,
          j.name as jurisdiction_name
        FROM alerts_sent a
        INNER JOIN filings f ON a.filing_id = f.id
        INNER JOIN jurisdictions j ON f.jurisdiction_id = j.id
        WHERE a.subscriber_id = ${subscriberId}
          AND a.digested = false
        ORDER BY f.filed_at DESC
      `);

      if (permits.length === 0) continue;

      // Build the city list from the permits
      const cities = Array.from(new Set(permits.map((p) => p.jurisdiction_name as string)));

      // Build digest email HTML
      const permitRows = permits.map((p) => {
        const permitNumber = p.external_id || "N/A";
        const address = p.address_raw;
        const type = p.filing_type === "building_permit" ? "Building Permit" : "Business License";
        const issuedDate = new Date(p.filed_at as string).toLocaleDateString("en-US", {
          year: "numeric", month: "long", day: "numeric"
        });
        const city = p.jurisdiction_name;

        return `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px 12px; font-weight: 500; font-size: 13px;">${permitNumber}</td>
            <td style="padding: 10px 12px; font-size: 13px;">${address}</td>
            <td style="padding: 10px 12px; font-size: 13px;">${city}</td>
            <td style="padding: 10px 12px; font-size: 13px;">${type}</td>
            <td style="padding: 10px 12px; color: #6b7280; font-size: 13px;">${issuedDate}</td>
          </tr>`;
      }).join("");

      const todayFormatted = new Date().toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
      });

      const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px;">
          <div style="border-bottom: 2px solid #0d9488; padding-bottom: 10px; margin-bottom: 20px;">
            <h2 style="color: #0f766e; margin: 0;">Portafor Daily Digest</h2>
            <p style="color: #6b7280; margin: 4px 0 0 0; font-size: 14px;">${todayFormatted}</p>
          </div>
          <p>Hello <strong>${businessName}</strong>,</p>
          <p>Here are the <strong>${permits.length} new permit${permits.length > 1 ? "s" : ""}</strong> filed in your territory${cities.length > 0 ? ` (${cities.join(", ")})` : ""}:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background-color: #f0fdfa; text-align: left;">
                <th style="padding: 8px 12px; font-weight: 600; font-size: 13px;">Permit #</th>
                <th style="padding: 8px 12px; font-weight: 600; font-size: 13px;">Address</th>
                <th style="padding: 8px 12px; font-weight: 600; font-size: 13px;">City</th>
                <th style="padding: 8px 12px; font-weight: 600; font-size: 13px;">Type</th>
                <th style="padding: 8px 12px; font-weight: 600; font-size: 13px;">Issued</th>
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

      const textBody = [
        `Portafor Daily Digest — ${todayFormatted}`,
        ``,
        `Hello ${businessName},`,
        ``,
        `${permits.length} new permit(s) filed in your territory:`,
        ``,
        ...permits.map((p) => {
          const permitNumber = p.external_id || "N/A";
          const type = p.filing_type === "building_permit" ? "Building Permit" : "Business License";
          const issuedDate = new Date(p.filed_at as string).toLocaleDateString();
          return `- [${permitNumber}] ${p.address_raw} (${p.jurisdiction_name}) — ${type} — Issued: ${issuedDate}`;
        }),
        ``,
        `View in dashboard: https://www.portafor.info/dashboard`
      ].join("\n");

      // Send digest email via Resend
      try {
        if (process.env.RESEND_API_KEY) {
          const senderEmail = process.env.SENDER_EMAIL || "digest@portafor.info";
          const emailResponse = await fetch("https://api.resend.com/emails", {
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

          if (!emailResponse.ok) {
            const errText = await emailResponse.text();
            console.error(`Resend error for ${email}:`, errText);
            report.push({ subscriber: businessName, permits: permits.length, status: "failed", error: errText });
            continue;
          }
        } else {
          console.log(`[Digest Mock] To: ${email} | ${permits.length} permits`);
        }

        // Mark alerts as digested
        await db.execute(sql`
          UPDATE alerts_sent
          SET digested = true
          WHERE subscriber_id = ${subscriberId}
            AND digested = false
        `);

        totalEmailsSent++;
        report.push({ subscriber: businessName, permits: permits.length, status: "sent" });
      } catch (emailErr) {
        console.error(`Failed to send digest to ${email}:`, emailErr);
        report.push({ subscriber: businessName, permits: permits.length, status: "failed" });
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      subscribersProcessed: subscribersWithAlerts.length,
      emailsSent: totalEmailsSent,
      details: report
    });
  } catch (error) {
    console.error("Digest job failed:", error);
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
