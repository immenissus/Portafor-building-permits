export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email via Resend. Returns true on success, throws on failure.
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[Email Mock] To: ${options.to} | Subject: ${options.subject}`);
    return true;
  }

  const senderEmail = process.env.SENDER_EMAIL || "onboarding@resend.dev";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: senderEmail,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API returned error: ${errorText}`);
  }

  return true;
}

/**
 * Build a styled email footer.
 */
export function emailFooter(): string {
  return `
    <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
      This message was sent from Portafor. You receive this because you have email alerts enabled.
    </p>`;
}

/**
 * Build the email header block.
 */
export function emailHeader(title: string, subtitle?: string): string {
  return `
    <div style="border-bottom: 2px solid #0d9488; padding-bottom: 10px; margin-bottom: 20px;">
      <h2 style="color: #0f766e; margin: 0;">${title}</h2>
      ${subtitle ? `<p style="color: #6b7280; margin: 4px 0 0 0; font-size: 14px;">${subtitle}</p>` : ""}
    </div>`;
}
