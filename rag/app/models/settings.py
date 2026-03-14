"""AppSetting SQLModel table."""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.models.base import utcnow


class AppSetting(SQLModel, table=True):
    __tablename__ = "settings"

    key: str = Field(primary_key=True)
    value: str = ""
    is_secret: bool = False
    updated_at: datetime = Field(default_factory=utcnow)
