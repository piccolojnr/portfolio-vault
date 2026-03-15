from datetime import datetime, timezone


def utcnow() -> datetime:
    """Return current UTC time as a timezone-naive datetime.

    SQLModel's default DateTime column maps to TIMESTAMP WITHOUT TIME ZONE.
    asyncpg raises DataError if you pass a tz-aware datetime to such a column.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
