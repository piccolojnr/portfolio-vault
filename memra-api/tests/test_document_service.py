"""Tests for memra.domain.services.document — document service helpers."""

from __future__ import annotations

import pytest

from memra.domain.services.document import (
    SUPPORTED_MIMETYPES,
    _filename_to_slug,
)


class TestFilenameToSlug:
    def test_simple_filename(self):
        assert _filename_to_slug("My Document.pdf") == "my-document"

    def test_markdown_file(self):
        assert _filename_to_slug("readme.md") == "readme"

    def test_special_characters(self):
        assert _filename_to_slug("report (final) v2.txt") == "report-final-v2"

    def test_uppercase(self):
        assert _filename_to_slug("README.MD") == "readme"

    def test_dots_in_name(self):
        assert _filename_to_slug("my.file.name.pdf") == "my-file-name"

    def test_underscores(self):
        assert _filename_to_slug("my_document_v2.txt") == "my-document-v2"

    def test_consecutive_specials(self):
        assert _filename_to_slug("a---b___c.pdf") == "a-b-c"

    def test_leading_trailing_stripped(self):
        assert _filename_to_slug("---file---.txt") == "file"

    def test_all_special_chars_fallback(self):
        assert _filename_to_slug("!!!.txt") == "upload"

    def test_empty_stem(self):
        assert _filename_to_slug(".gitignore") == "gitignore"

    def test_numbers(self):
        assert _filename_to_slug("2024-01-15-notes.md") == "2024-01-15-notes"

    def test_no_extension(self):
        assert _filename_to_slug("Dockerfile") == "dockerfile"

    def test_deeply_nested_path(self):
        assert _filename_to_slug("some/path/to/file.pdf") == "file"


class TestSupportedMimetypes:
    def test_text_plain(self):
        assert "text/plain" in SUPPORTED_MIMETYPES

    def test_text_markdown(self):
        assert "text/markdown" in SUPPORTED_MIMETYPES

    def test_pdf_not_supported(self):
        assert "application/pdf" not in SUPPORTED_MIMETYPES
