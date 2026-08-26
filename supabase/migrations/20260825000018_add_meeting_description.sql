-- Migration: 20260825000018_add_meeting_description.sql
-- Add description column to public.meetings table

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS description TEXT;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
