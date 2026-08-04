-- Migration: 20260730134000_user_preferences.sql
-- Description: Adds a JSONB preferences column to public.users to store UI and notification settings.

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
