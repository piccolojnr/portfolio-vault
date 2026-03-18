"""Email backends: console (dev), Mailpit (local SMTP), Resend (production)."""

from __future__ import annotations

import logging
import smtplib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


@dataclass
class EmailMessage:
    to: str
    subject: str
    html: str
    text: str = field(default="")


class EmailBackend(ABC):
    @abstractmethod
    async def send(self, message: EmailMessage) -> None: ...


class ConsoleBackend(EmailBackend):
    """Prints the full email to stdout. Never raises. Safe for dev/test."""

    async def send(self, message: EmailMessage) -> None:
        body = message.text or message.html
        print(
            f"\n--- EMAIL ---\n"
            f"To: {message.to}\n"
            f"Subject: {message.subject}\n"
            f"---\n{body}\n--- END EMAIL ---\n"
        )


class MailpitBackend(EmailBackend):
    """Sends via local Mailpit SMTP (no auth). Ideal for local dev."""

    async def send(self, message: EmailMessage) -> None:
        from portfolio_rag.app.core.config import get_settings

        settings = get_settings()
        host = settings.mailpit_host
        port = settings.mailpit_port

        msg = MIMEMultipart("alternative")
        msg["Subject"] = message.subject
        msg["From"] = settings.email_from
        msg["To"] = message.to

        if message.text:
            msg.attach(MIMEText(message.text, "plain"))
        msg.attach(MIMEText(message.html, "html"))

        with smtplib.SMTP(host, port) as smtp:
            smtp.sendmail(settings.email_from, [message.to], msg.as_string())

        logger.info("Mailpit: sent '%s' → %s", message.subject, message.to)


class ResendBackend(EmailBackend):
    """Sends via the Resend SDK. Requires RESEND_API_KEY."""

    async def send(self, message: EmailMessage) -> None:
        import resend  # type: ignore[import]

        from portfolio_rag.app.core.config import get_settings

        settings = get_settings()
        resend.api_key = settings.resend_api_key

        params: resend.Emails.SendParams = {
            "from": settings.email_from,
            "to": [message.to],
            "subject": message.subject,
            "html": message.html,
        }
        if message.text:
            params["text"] = message.text

        resend.Emails.send(params)
        logger.info("Resend: sent '%s' → %s", message.subject, message.to)


def get_email_backend() -> EmailBackend:
    """Return the configured email backend. Defaults to ConsoleBackend."""
    from portfolio_rag.app.core.config import get_settings

    settings = get_settings()
    backend = settings.email_backend.lower()

    if backend == "mailpit":
        return MailpitBackend()
    if backend == "resend":
        return ResendBackend()
    return ConsoleBackend()
