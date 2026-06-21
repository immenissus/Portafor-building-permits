import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { subscribers, alertsSent } from "@/lib/db/schema";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    // Fetch the subscriber profile
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

    // Generate highly realistic mock roofing alert details
    const businessName = subscriber.businessName;
    const filingLabel = "ROOFING PERMIT";
    const address = "1100 Congress Ave, Austin, TX 78701";
    const contractor = "Texas Premier Roofers";
    const valuationStr = "$32,450.00";
    const filedDateStr = new Date().toISOString().split("T")[0];
    const description = "Complete removal of shingle roofing, repairing rotted decking, and installing GAF Timberline HDZ architectural shingles. Underlayment replacement with synthetic felt.";

    const subject = `[RoofLead Alert] [TEST] New ${filingLabel} in your service area`;
    const textBody = `Hello ${businessName},\n\nThis is a test alert to verify your email notifications are active:\n\n- Filing Type: ${filingLabel}\n- Address: ${address}\n- Date Filed: ${filedDateStr}\n- Contractor: ${contractor}\n- Project Value: ${valuationStr}\n- Description: ${description}\n\nYour lead alert system is fully operational!\nBest,\nRoofLead Team`;

    const htmlBody = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="border-bottom: 2px solid #0d9488; padding-bottom: 10px; margin-bottom: 20px;">
          <h2 style="color: #0f766e; margin: 0;">RoofLead Lead Alert [TEST MODE]</h2>
        </div>
        <p>Hello <strong>${businessName}</strong>,</p>
        <p>This is a test alert showing what a real homeowner lead will look like when delivered to your inbox:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0; width: 30%;">Filing Type</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${filingLabel}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Matched Address</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${address}</td>
          </tr>
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Date Filed</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${filedDateStr}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Contractor</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${contractor}</td>
          </tr>
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Project Value</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${valuationStr}</td>
          </tr>
        </table>

        <div style="background-color: #f0fdfa; border-left: 4px solid #0d9488; padding: 15px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 8px 0; color: #0f766e;">Filing Description</h4>
          <p style="margin: 0; font-size: 14px;">${description}</p>
        </div>

        <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; padding: 15px; text-align: center; margin-bottom: 25px; border-radius: 8px;">
          <p style="margin: 0; font-weight: bold; color: #0f766e; font-size: 15px;">✅ Connection Success!</p>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Your email alerts are fully configured and ready to receive real Socrata municipal feeds.</p>
        </div>

        <p style="font-size: 12px; color: #64748b; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
          This test message was sent from RoofLead. If you did not request this, please ignore this email.
        </p>
      </body>
    </html>
    `;

    // Dispatch Email (Uses Resend or falls back to server console log)
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
      console.log(`[Test Email Mock Dispatch] Target: ${email} | Subject: ${subject}`);
    }

    return NextResponse.json({ success: true, email });
  } catch (error) {
    console.error("Failed to send test alert email:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Something went wrong" },
      { status: 500 }
    );
  }
}
