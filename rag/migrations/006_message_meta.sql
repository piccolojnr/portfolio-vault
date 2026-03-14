-- Migration 006: add meta JSONB column to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta JSONB;
