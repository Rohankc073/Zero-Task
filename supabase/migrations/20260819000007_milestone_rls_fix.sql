-- Migration: 20260819000007_milestone_rls_fix.sql
-- Description: Fixes project_milestones RLS to properly scope Manager access

DROP POLICY IF EXISTS "Users can view milestones if they can view the project" ON public.project_milestones;
DROP POLICY IF EXISTS "Management can manage milestones" ON public.project_milestones;

-- Project Milestones RLS (Scoping properly)
CREATE POLICY "Users can view milestones if they can view the project"
ON public.project_milestones FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_milestones.project_id AND (
    projects.owner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.project_members WHERE project_members.project_id = projects.id AND project_members.user_id = auth.uid()) OR
    public.get_auth_user_role() IN ('Founder', 'Department Head')
  ))
);

CREATE POLICY "Management can manage milestones"
ON public.project_milestones FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_milestones.project_id AND (
    projects.owner_id = auth.uid() OR
    public.get_auth_user_role() IN ('Founder', 'Department Head')
  ))
);

