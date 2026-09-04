import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

async function verify() {
  console.log("--- Checking Row Counts Across Tables ---");
  
  // Wipe task_assignees, project_members, meeting_participants explicitly if any rows remain
  await supabase.from('task_assignees').delete().not('task_id', 'is', null);
  await supabase.from('project_members').delete().not('project_id', 'is', null);
  await supabase.from('meeting_participants').delete().not('meeting_id', 'is', null);

  const tables = [
    'users',
    'companies',
    'tasks',
    'task_voice_notes',
    'task_files',
    'task_assignees',
    'projects',
    'project_members',
    'meetings',
    'meeting_participants',
    'meeting_approvals',
    'chat_channels',
    'chat_messages',
    'comments',
    'activity_logs',
    'execution_activity',
    'departments',
    'designations',
    'in_app_notifications',
    'system_alerts',
    'audit_logs',
    'registration_requests',
  ];

  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`Table ${t}: Error (${error.message})`);
    } else {
      console.log(`Table ${t}: ${count} rows`);
    }
  }

  console.log("\n--- Checking Auth Users ---");
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  console.log(`Auth Users Count: ${authUsers?.users?.length || 0}`);
  for (const u of authUsers?.users || []) {
    console.log(`- ${u.email} (ID: ${u.id})`);
  }

  console.log("\n--- Checking Superadmin in public.users ---");
  const { data: superAdmin } = await supabase.from('users').select('*');
  console.log("Public Users:", superAdmin);
}

verify().catch(console.error);
