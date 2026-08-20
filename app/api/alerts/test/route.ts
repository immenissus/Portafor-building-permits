import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { subscribers } from "@/lib/db/schema";
import { filingTypeAnySql, serviceAreaSql } from "@/lib/filings";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const [subscriber] = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.id, userId))
      .limit(1);

    if (!subscriber) {
      return NextResponse.json(
        { detail: "Subscriber profile not found. Please complete onboarding first!" },
        { status: 404 }
      );
    }

    const email = subscriber.email;
    if (!email) {
      return NextResponse.json({ detail: "No email address linked to your profile." }, { status: 400 });
    }

    const businessName = subscriber.businessName;
    const serviceArea = subscriber.serviceArea as string;
    const filingFilters = subscriber.filingTypeFilters as string[];

    // Fetch real permits from the subscriber's territory from the last 7 days
    const geometry = serviceAreaSql(serviceArea);
    const geometryExpression = geometry.expression === "geojson"
      ? sql`ST_GeomFromGeoJSON(${geometry.value})`
      : sql`ST_GeomFromWKB(decode(${geometry.value}, 'hex'), 4326)`;
    const permits = await db.execute(sql`
      SELECT
        f.external_id,
        f.filing_type,
        f.address_raw,
        f.filed_at,
        j.name as jurisdiction_name
      FROM filings f
      INNER JOIN jurisdictions j ON f.jurisdiction_id = j.id
       WHERE ST_Contains(${geometryExpression}, f.geom)
        AND f.filed_at >= NOW() - INTERVAL '7 days'
        AND ${sql.raw(filingTypeAnySql(filingFilters))}
      ORDER BY f.filed_at DESC
      LIMIT 20
    `);

    const permitCount = permits.length;

    const subject = permitCount > 0
      ? `[Portafor Test] ${permitCount} real permit${permitCount > 1 ? "s" : ""} from the last 7 days in your territory`
      : `[Portafor Test] No permits found in your territory this week`;

    // Build permit rows
    const permitRows = permits.map((p) => {
      const permitNumber = p.external_id || "N/A";
      const type = p.filing_type === "building_permit" ? "Building Permit" : "Business License";
      const issuedDate = new Date(p.filed_at as string).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric"
      });
      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 12px; font-weight: 500; font-size: 13px;">${permitNumber}</td>
          <td style="padding: 10px 12px; font-size: 13px;">${p.address_raw}</td>
          <td style="padding: 10px 12px; font-size: 13px;">${p.jurisdiction_name}</td>
          <td style="padding: 10px 12px; font-size: 13px;">${type}</td>
          <td style="padding: 10px 12px; color: #6b7280; font-size: 13px;">${issuedDate}</td>
        </tr>`;
    }).join("");

    const permitTable = permitCount > 0 ? `
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
      </table>` : `
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; font-size: 14px;">No permits matching your filters were found in your territory in the last 7 days. This could mean your territory is in a low-activity area, or no new permits have been filed recently.</p>
      </div>`;

    const htmlBody = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px;">
        <div style="border-bottom: 2px solid #0d9488; padding-bottom: 10px; margin-bottom: 20px;">
          <h2 style="color: #0f766e; margin: 0;">Portafor Test Email</h2>
          <p style="color: #6b7280; margin: 4px 0 0 0; font-size: 14px;">Last 7 days of real permits from your territory</p>
        </div>
        <p>Hello <strong>${businessName}</strong>,</p>
        <p>This is a test email showing <strong>${permitCount} real permit${permitCount !== 1 ? "s" : ""}</strong> filed in your territory in the last 7 days.</p>
        ${permitTable}
        <div style="background-color: #f0fdfa; border-left: 4px solid #0d9488; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px;"><strong>Your territory filters:</strong> ${filingFilters.map(f => f === "building_permit" ? "Building Permits" : "Business Licenses").join(", ")}</p>
        </div>
        <div style="text-align: center; margin: 25px 0;">
          <a href="https://www.portafor.info/dashboard" style="background-color: #0d9488; color: white; padding: 10px 24px; text-decoration: none; border-radius: 8px; font-weight: 500;">View in Dashboard</a>
        </div>
        <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
          This is a test message from Portafor. Your email alerts are fully configured and ready.
        </p>
      </body>
    </html>`;

    const textBody = [
      `Portafor Test Email — Last 7 days of real permits`,
      ``,
      `Hello ${businessName},`,
      ``,
      `${permitCount} real permit(s) from your territory in the last 7 days:`,
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

    if (process.env.RESEND_API_KEY) {
      const senderEmail = process.env.SENDER_EMAIL || "onboarding@resend.dev";
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: senderEmail,
          to: email,
          subject,
          html: htmlBody,
          text: textBody
        })
      });

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        throw new Error(`Resend API returned error: ${errorText}`);
      }
    } else {
      console.log(`[Test Email Mock] To: ${email} | ${permitCount} permits`);
    }

    return NextResponse.json({ success: true, email, permitsFound: permitCount });
  } catch (error) {
    console.error("Failed to send test alert email:", error);
    return NextResponse.json(
      { detail: "Failed to send test alert" },
      { status: 500 }
    );
  }
}
