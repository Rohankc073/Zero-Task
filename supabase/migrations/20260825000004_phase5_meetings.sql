-- Phase 5: Meeting System & Approval Workflow

-- 1. Extend meetings table
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Scheduled';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_link TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS meeting_platform TEXT;

-- 2. Create meeting_requests table for the approval workflow
CREATE TABLE IF NOT EXISTS public.meeting_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    requester_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    approver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected'
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for meeting_requests
ALTER TABLE public.meeting_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own meeting requests" ON public.meeting_requests;
CREATE POLICY "Users can view their own meeting requests"
ON public.meeting_requests FOR SELECT
USING (auth.uid() = requester_id OR auth.uid() = approver_id);

DROP POLICY IF EXISTS "Users can insert meeting requests" ON public.meeting_requests;
CREATE POLICY "Users can insert meeting requests"
ON public.meeting_requests FOR INSERT
WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Approvers can update meeting requests" ON public.meeting_requests;
CREATE POLICY "Approvers can update meeting requests"
ON public.meeting_requests FOR UPDATE
USING (auth.uid() = approver_id OR get_auth_user_role() = 'Founder');

-- Trigger to sync meeting status when request is approved
CREATE OR REPLACE FUNCTION public.sync_meeting_status_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.status = 'Approved' THEN
        UPDATE public.meetings SET status = 'Scheduled' WHERE id = NEW.meeting_id;
    ELSIF NEW.status = 'Rejected' THEN
        UPDATE public.meetings SET status = 'Cancelled' WHERE id = NEW.meeting_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meeting_request_approval ON public.meeting_requests;
CREATE TRIGGER trg_meeting_request_approval
AFTER UPDATE OF status ON public.meeting_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_meeting_status_on_approval();
