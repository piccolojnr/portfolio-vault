"""Settings read/write schemas."""

from typing import Optional

from pydantic import BaseModel


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
