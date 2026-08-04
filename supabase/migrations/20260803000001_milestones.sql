-- Create the department_milestones table
CREATE TABLE department_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    target_value NUMERIC NOT NULL,
    current_value NUMERIC DEFAULT 0,
    unit TEXT NOT NULL,
    is_achieved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE department_milestones ENABLE ROW LEVEL SECURITY;

-- Policies for department_milestones

-- Founders can do everything
CREATE POLICY "Founders can manage all milestones" 
    ON department_milestones
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'Founder'
        )
    );

-- Department Heads and Managers can manage milestones for their own department
CREATE POLICY "Managers and Heads can manage department milestones" 
    ON department_milestones
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('Department Head', 'Manager')
            AND users.department_id = department_milestones.department_id
        )
    );

-- Employees can only view milestones for their own department
CREATE POLICY "Employees can view department milestones" 
    ON department_milestones
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.department_id = department_milestones.department_id
        )
    );

-- Add realtime subscription for department_milestones
alter publication supabase_realtime add table department_milestones;
