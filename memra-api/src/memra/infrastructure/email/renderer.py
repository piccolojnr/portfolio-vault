"""Jinja2-based email renderer: loads templates and returns EmailMessage objects."""

from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .backends import EmailMessage

_TEMPLATES_DIR = Path(__file__).parent / "templates"


class _TextExtractor(HTMLParser):
    """Minimal HTML → plain-text stripper."""

    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []

    def handle_data(self, data: str) -> None:
        stripped = data.strip()
        if stripped:
            self._chunks.append(stripped)

    def result(self) -> str:
        return "\n".join(self._chunks)


def _html_to_text(html: str) -> str:
    extractor = _TextExtractor()
    extractor.feed(html)
    return extractor.result()


def _extract_subject(html: str, context: dict) -> str:
    """Pull subject from context first, then <title> tag, else empty string."""
    if context.get("subject"):
        return str(context["subject"])
    match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    if match:
        return match.group(1).strip()
    return ""


class EmailRenderer:
    """Render Jinja2 email templates into EmailMessage objects."""

    def __init__(self) -> None:
        self._env = Environment(
            loader=FileSystemLoader(str(_TEMPLATES_DIR)),
            autoescape=select_autoescape(["html"]),
        )

    @staticmethod
    def _global_defaults() -> dict:
        """Settings-derived defaults injected into every template render."""
        from memra.app.core.config import get_settings

        settings = get_settings()
        return {
            "app_name": settings.app_name,
            "app_url": settings.app_url,
        }

    def render(self, template_name: str, context: dict) -> EmailMessage:
        merged = {**self._global_defaults(), **context}
        template = self._env.get_template(template_name)
        html = template.render(**merged)
        subject = _extract_subject(html, merged)
        text = _html_to_text(html)
        to = merged.get("to", "")
        return EmailMessage(to=to, subject=subject, html=html, text=text)


_renderer: EmailRenderer | None = None


def get_renderer() -> EmailRenderer:
    global _renderer
    if _renderer is None:
        _renderer = EmailRenderer()
    return _renderer
