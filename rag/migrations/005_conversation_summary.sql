-- Migration 005: rolling summary columns for conversations
-- Run after 004_fix_conversations_tz.sql

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS summary                      TEXT,
    ADD COLUMN IF NOT EXISTS summarised_up_to_message_id UUID REFERENCES messages(id);
