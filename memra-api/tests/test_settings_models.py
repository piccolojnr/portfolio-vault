"""Tests for memra.domain.models.settings — settings schemas."""

from __future__ import annotations

import pytest

from memra.domain.models.settings import (
    DEFAULT_PERSONA_PROMPT,
    FIXED_SYSTEM_PROMPT_SUFFIX,
    RuntimeConfig,
    SettingsRead,
    SettingsUpdate,
)


class TestDefaultPrompts:
    def test_persona_prompt_nonempty(self):
        assert len(DEFAULT_PERSONA_PROMPT) > 100

    def test_persona_prompt_mentions_knowledge_base(self):
        assert "knowledge base" in DEFAULT_PERSONA_PROMPT.lower()

    def test_suffix_mentions_document_generation(self):
        assert "document generation" in FIXED_SYSTEM_PROMPT_SUFFIX.lower()

    def test_suffix_has_document_wrapper(self):
        assert "<document type=" in FIXED_SYSTEM_PROMPT_SUFFIX


class TestRuntimeConfig:
    def test_defaults(self):
        rc = RuntimeConfig(
            anthropic_model="claude-sonnet-4-6",
            openai_model="gpt-4o",
            system_prompt="test",
            classifier_anthropic_model="claude-haiku-4-5-20251001",
            classifier_openai_model="gpt-4o-mini",
            summarizer_anthropic_model="claude-haiku-4-5-20251001",
            summarizer_openai_model="gpt-4o-mini",
        )
        assert rc.anthropic_api_key == ""
        assert rc.openai_api_key == ""

    def test_with_keys(self):
        rc = RuntimeConfig(
            anthropic_api_key="sk-ant-123",
            openai_api_key="sk-oai-456",
            anthropic_model="m1",
            openai_model="m2",
            system_prompt="p",
            classifier_anthropic_model="c1",
            classifier_openai_model="c2",
            summarizer_anthropic_model="s1",
            summarizer_openai_model="s2",
        )
        assert rc.anthropic_api_key == "sk-ant-123"


class TestSettingsRead:
    def test_valid(self):
        sr = SettingsRead(
            openai_api_key_set=True,
            anthropic_api_key_set=False,
            embedding_model="text-embedding-3-small",
            anthropic_model="claude-sonnet-4-6",
            openai_model="gpt-4o",
            cost_limit_usd=0.5,
            system_prompt="Test prompt",
            classifier_anthropic_model="claude-haiku-4-5-20251001",
            classifier_openai_model="gpt-4o-mini",
            summarizer_anthropic_model="claude-haiku-4-5-20251001",
            summarizer_openai_model="gpt-4o-mini",
            embedding_model_options=["text-embedding-3-small"],
            anthropic_model_options=["claude-sonnet-4-6"],
            openai_model_options=["gpt-4o"],
        )
        assert sr.openai_api_key_set is True
        assert sr.anthropic_api_key_set is False


class TestSettingsUpdate:
    def test_all_none(self):
        su = SettingsUpdate()
        assert su.openai_api_key is None
        assert su.anthropic_api_key is None
        assert su.embedding_model is None

    def test_partial_update(self):
        su = SettingsUpdate(anthropic_model="claude-haiku-4-5-20251001", cost_limit_usd=1.0)
        assert su.anthropic_model == "claude-haiku-4-5-20251001"
        assert su.cost_limit_usd == 1.0
        assert su.openai_model is None

    def test_clear_key(self):
        su = SettingsUpdate(openai_api_key="")
        assert su.openai_api_key == ""
