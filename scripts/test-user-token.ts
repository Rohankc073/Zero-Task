import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const adminClient = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testWithToken() {
  const { data: user, error: userError } = await adminClient
    .from('users')
    .select('*')
    .eq('email', 'ch@gmail.com')
    .single();

  console.log("User:", user);

  // Generate a link or sign in
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: 'ch@gmail.com'
  });

  const anonClient = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Verify OTP / Token Hash
  if (linkData?.properties?.hashed_token) {
    const { data: sessionData, error: sessionError } = await anonClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink'
    });

    console.log("Session user:", sessionData?.user?.id);
    
    const { data: tasks, error: tasksError } = await anonClient
      .from('tasks')
      .select(`
        *,
        departments:departments(id, name),
        companies:companies(id, name),
        task_assignees:task_assignees(
          user_id,
          users:users(id, full_name, name, avatar_url, role)
        )
      `);
    console.log("Tasks visible to user:", tasks?.length, tasks);
  }
}

testWithToken().catch(console.error);
