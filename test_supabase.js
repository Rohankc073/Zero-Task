const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const email = `test_${Date.now()}@test.com`;
  const password = 'password123';
  
  console.log("Signing up user:", email);
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    console.error("SignUp Error:", authError);
    process.exit(1);
  }
  
  const userId = authData.user.id;
  console.log("User ID:", userId);

  console.log("Waiting for trigger to create public.users...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("Creating project...");
  const { data: project, error: projError } = await supabase.from('projects').insert({
    name: 'Test Project ' + Date.now(),
    description: null,
    start_date: null,
    end_date: null,
    status: 'Active',
    owner_id: userId
  }).select().single();

  if (projError) {
    console.error("Project Insert Error:", projError);
  } else {
    console.log("Project created:", project);
  }
  
  console.log("Fetching tasks...");
  const { data: tasks, error: tasksError } = await supabase.from('tasks').select('*');
  if (tasksError) {
    console.error("Tasks Fetch Error:", tasksError);
  } else {
    console.log("Tasks fetched:", tasks);
  }
}

run();
