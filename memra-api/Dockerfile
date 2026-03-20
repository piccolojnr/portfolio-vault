FROM python:3.12-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev gcc \
        # WeasyPrint system dependencies for PDF export
        libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 \
        libffi-dev shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt pyproject.toml ./
COPY src/ src/

RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir -e .

COPY alembic.ini ./
COPY migrations/ migrations/
COPY Procfile ./

EXPOSE 8000
