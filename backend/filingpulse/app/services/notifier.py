"""
app/services/notifier.py
========================
Email notification service supporting both SMTP and Resend backends.
Operates asynchronously by executing blocking IO in a separate thread pool.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests

from ..config import get_settings
from ..models.subscriber import Subscriber
from ..models.filing import Filing

logger = logging.getLogger(__name__)
settings = get_settings()


class NotifierError(Exception):
    """Base exception for notification delivery failures."""


class EmailNotifier:
    """
    Handles dispatching transaction-alert emails to matching subscribers.
    Configurable via environment variables to use either Resend or standard SMTP.
    """

    def __init__(self) -> None:
        self.backend = settings.email_backend

    async def send_alert(self, subscriber: Subscriber, filing: Filing) -> None:
        """
        Send a notification email to a subscriber about a newly matched filing.
        Executes the blocking HTTP/SMTP network operations in a background thread
        to prevent blocking FastAPI's main event loop.

        Parameters
        ----------
        subscriber: Subscriber
            The matched subscriber.
        filing: Filing
            The matched filing.

        Raises
        ------
        NotifierError
            If email dispatch fails.
        """
        subject, text_body, html_body = self._build_email_content(subscriber, filing)

        if self.backend == "resend":
            await asyncio.to_thread(
                self._send_via_resend,
                to_email=subscriber.email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
            )
        elif self.backend == "smtp":
            await asyncio.to_thread(
                self._send_via_smtp,
                to_email=subscriber.email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
            )
        else:
            raise NotifierError(f"Unsupported email backend: {self.backend!r}")

    def _build_email_content(
        self,
        subscriber: Subscriber,
        filing: Filing,
    ) -> tuple[str, str, str]:
        """Generate email subject, plain text body, and HTML body."""
        filing_label = filing.filing_type.replace("_", " ").title()
        subject = f"[FilingPulse Alert] New {filing_label} in your service area"

        # Extract optional info from raw_payload if available
        description = (
            filing.raw_payload.get("description")
            or filing.raw_payload.get("permit_type_description")
            or filing.raw_payload.get("nature_of_call") # Dallas fallback
            or "No description provided."
        )
        contractor = filing.raw_payload.get("contractor") or "Not listed"
        valuation = filing.raw_payload.get("valuation")
        valuation_str = f"${valuation:,.2f}" if valuation is not None else "Not listed"
        filed_date_str = filing.filed_at.strftime("%Y-%m-%d")

        text_body = (
            f"Hello {subscriber.business_name},\n\n"
            f"A new filing has matched your service area and filing type filters:\n\n"
            f"- Filing Type: {filing_label}\n"
            f"- Address: {filing.address_raw}\n"
            f"- Date Filed: {filed_date_str}\n"
            f"- Description: {description}\n"
            f"- Contractor: {contractor}\n"
            f"- Project Valuation: {valuation_str}\n\n"
            f"Best regards,\n"
            f"The FilingPulse Team"
        )

        html_body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-bottom: 20px;">
                    <h2 style="color: #1e3a8a; margin: 0;">FilingPulse Lead Alert</h2>
                </div>
                <p>Hello <strong>{subscriber.business_name}</strong>,</p>
                <p>A new filing matching your monitored service area and filters has been processed:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr style="background-color: #f8fafc;">
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0; width: 30%;">Filing Type</td>
                        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{filing_label}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Matched Address</td>
                        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{filing.address_raw}</td>
                    </tr>
                    <tr style="background-color: #f8fafc;">
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Date Filed</td>
                        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{filed_date_str}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Contractor</td>
                        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{contractor}</td>
                    </tr>
                    <tr style="background-color: #f8fafc;">
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Project Value</td>
                        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">{valuation_str}</td>
                    </tr>
                </table>

                <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin-bottom: 20px;">
                    <h4 style="margin: 0 0 8px 0; color: #1e3a8a;">Filing Description</h4>
                    <p style="margin: 0; font-size: 14px;">{description}</p>
                </div>

                <p style="font-size: 12px; color: #64748b; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                    This email is an automated lead notification from FilingPulse.<br>
                    To change your filters or unsubscribe, please reply to this email or update your settings.
                </p>
            </body>
        </html>
        """
        return subject, text_body, html_body

    def _send_via_resend(
        self,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: str,
    ) -> None:
        """Deliver email using Resend JSON API."""
        if not settings.resend_api_key:
            raise NotifierError("Resend API key is not configured.")

        headers = {
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "from": f"{settings.smtp_from_name} <{settings.resend_from_address}>",
            "to": [to_email],
            "subject": subject,
            "text": text_body,
            "html": html_body,
        }

        try:
            response = requests.post(
                settings.resend_api_url,
                headers=headers,
                json=payload,
                timeout=10,
            )
            if response.status_code >= 300:
                raise NotifierError(
                    f"Resend API error: HTTP {response.status_code} - {response.text}"
                )
            logger.info("Successfully sent email via Resend to %s", to_email)
        except Exception as e:
            logger.error("Failed to send email via Resend to %s: %s", to_email, str(e))
            raise NotifierError(f"Resend delivery failed: {e}") from e

    def _send_via_smtp(
        self,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: str,
    ) -> None:
        """Deliver email using standard SMTP/TLS."""
        msg = MIMEMultipart("alternative")
        msg["Subject"] = Header(subject, "utf-8")
        msg["From"] = f'"{settings.smtp_from_name}" <{settings.smtp_from_address}>'
        msg["To"] = to_email

        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        try:
            # Connect to SMTP server
            smtp_cls = smtplib.SMTP_SSL if settings.smtp_port == 465 else smtplib.SMTP
            with smtp_cls(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                if settings.smtp_use_tls and settings.smtp_port != 465:
                    server.starttls()
                
                if settings.smtp_username and settings.smtp_password:
                    server.login(settings.smtp_username, settings.smtp_password)
                
                server.sendmail(
                    settings.smtp_from_address,
                    [to_email],
                    msg.as_string(),
                )
            logger.info("Successfully sent email via SMTP to %s", to_email)
        except Exception as e:
            logger.error("Failed to send email via SMTP to %s: %s", to_email, str(e))
            raise NotifierError(f"SMTP delivery failed: {e}") from e
