"""Settings read/write schemas."""

from typing import Optional

from pydantic import BaseModel

# Editable persona section — stored in the DB and shown in the settings UI.
# Users can customise the assistant's identity, tone, and job description.
DEFAULT_PERSONA_PROMPT = """You are a knowledgeable assistant with access to an organisation's knowledge base — their documents, notes, and reference materials.

Your job:
- Answer questions accurately based on the documents in the knowledge base
- Summarise, compare, and extract insights from the available content
- Draft documents or written content on behalf of the user when asked (use "I", "my", "me")
- Help users find connections and patterns across their documents
- Have a natural, conversational tone while remaining professional"""

# Fixed suffix — never stored in DB, always appended server-side.
# The document generation format MUST NOT be edited: the frontend's DOC_RE
# regex in chat-pipeline.ts depends on the exact <document type="..." title="...">
# wrapper format.  Changing it here would silently break document detection.
FIXED_SYSTEM_PROMPT_SUFFIX = """

Rules:
- Use the provided context to answer. Be specific — use names, numbers, and details from the documents.
- If asked something not in the context, say so honestly rather than guessing.
- When drafting documents, write in first person on behalf of the user.
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
