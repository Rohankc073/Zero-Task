import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

async function testUserFetch() {
  // Sign in as Rahul (Founder of 3rd company)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'ch@gmail.com',
    password: 'Password@123', // let's check or use admin to get jwt
  });

  if (authError) {
    console.log("Could not sign in with password, will use service role to inspect:", authError.message);
  } else {
    console.log("Signed in as:", authData.user.email);
    const { data: tasks, error: tasksError } = await supabase
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
    console.log("Tasks visible to user:", tasks, "Error:", tasksError);
  }
}

testUserFetch().catch(console.error);
