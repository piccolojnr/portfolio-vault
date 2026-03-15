"""Settings read/write schemas."""

from typing import Optional

from pydantic import BaseModel

# Editable persona section — stored in the DB and shown in the settings UI.
# Users can customise the assistant's identity, tone, and job description.
DEFAULT_PERSONA_PROMPT = """You are Daud Rahim's personal career assistant. You have access to his portfolio vault — his bio, skills, experience, and project overviews.

Your job:
- Answer questions about his background, skills, and projects with specificity and confidence
- Draft cover letters, resume sections, and bios on his behalf (use "I", "my", "me")
- Help him prepare for interviews with concrete STAR-format answers
- Identify which projects to highlight for a given role
- Write LinkedIn posts or professional summaries
- Have a natural, conversational tone while remaining professional"""

# Fixed suffix — never stored in DB, always appended server-side.
# The document generation format MUST NOT be edited: the frontend's DOC_RE
# regex in chat-pipeline.ts depends on the exact <document type="..." title="...">
# wrapper format.  Changing it here would silently break document detection.
FIXED_SYSTEM_PROMPT_SUFFIX = """

Rules:
- Use the provided context to answer. Be specific — use numbers, project names, technologies.
- If asked something not in the context, be honest but try to infer from what you know.
- When drafting documents, write in first person as Daud.
- Keep responses concise unless drafting a longer document.

Document generation:
When generating a formal document (CV, cover letter, resume, or bio), wrap the entire document like this:

<document type="cover_letter" title="Cover Letter — Company Name">
# Cover Letter

[full document content here]
</document>

Valid types: cv, cover_letter, resume, bio
For regular conversational answers, respond normally — no wrapper."""


class RuntimeConfig(BaseModel):
    """Returned to Next.js server routes only — contains real decrypted key values."""

    anthropic_api_key: str = ""
    openai_api_key: str = ""
    anthropic_model: str
    openai_model: str
    system_prompt: str
    classifier_anthropic_model: str
    classifier_openai_model: str
    summarizer_anthropic_model: str
    summarizer_openai_model: str


class SettingsRead(BaseModel):
    # API key status — never expose actual values
    openai_api_key_set: bool
    anthropic_api_key_set: bool

    # Model selection
    embedding_model: str
    anthropic_model: str
    openai_model: str

    # Cost
    cost_limit_usd: float

    # System prompt
    system_prompt: str

    # Classifier models
    classifier_anthropic_model: str
    classifier_openai_model: str

    # Summarizer models
    summarizer_anthropic_model: str
    summarizer_openai_model: str

    # Available options (for the frontend dropdowns)
    embedding_model_options: list[str]
    anthropic_model_options: list[str]
    openai_model_options: list[str]


class SettingsUpdate(BaseModel):
    # Pass a value to set, "" to clear, None to leave unchanged
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None

    # Pass a value to change, None to leave unchanged
    embedding_model: Optional[str] = None
    anthropic_model: Optional[str] = None
    openai_model: Optional[str] = None
    cost_limit_usd: Optional[float] = None
    system_prompt: Optional[str] = None
    classifier_anthropic_model: Optional[str] = None
    classifier_openai_model: Optional[str] = None
    summarizer_anthropic_model: Optional[str] = None
    summarizer_openai_model: Optional[str] = None
