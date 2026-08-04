import { createClient } from '@supabase/supabase-js';

// Try to load dotenv if available (useful if running via ts-node directly)
try {
  require('dotenv').config();
} catch (e) {
  // Ignore if not installed, assume env vars are provided
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables.");
  console.error("Please ensure EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.");
  process.exit(1);
}

// Initialize Supabase client with the Service Role Key to bypass RLS and access Admin Auth
const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const testAccounts = [
  { email: 'founder@gmail.com', role: 'Founder' },
  { email: 'dept@gmail.com', role: 'Department Head' },
  { email: 'manager@gmail.com', role: 'Manager' },
  { email: 'employee@gmail.com', role: 'Employee' },
];

const DEFAULT_PASSWORD = 'Test@123';

async function wipeAndSeed() {
  try {
    console.log("Starting Database Wipe & Seed operation...");

    // 1. Wipe all existing users
    console.log("Fetching existing users from public.users (bypassing listUsers 500 error)...");
    const { data: publicUsersData, error: fetchError } = await supabase.from('users').select('id, email');
    
    if (fetchError) {
      console.error("Failed to fetch from public.users:", fetchError.message);
    }

    const existingUsers = publicUsersData || [];
    console.log(`Found ${existingUsers.length} existing user(s) in public.users.`);

    if (existingUsers.length > 0) {
      console.log("Wiping existing auth users...");
      for (const user of existingUsers) {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
        if (deleteError) {
          console.error(`Failed to delete auth user ${user.id}:`, deleteError.message);
        } else {
          console.log(`Deleted auth user: ${user.email || user.id}`);
        }
      }
    } else {
      console.log("No existing users found in public.users to wipe.");
    }

    // Ensure public.users are cleared as well if ON DELETE CASCADE is not set
    console.log("Wiping public.users table just in case ON DELETE CASCADE is missing...");
    const { error: deletePublicUsersError } = await supabase
      .from('users')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Deletes all users

    if (deletePublicUsersError) {
      console.warn(`Warning: Could not clear public.users: ${deletePublicUsersError.message}`);
    }

    // 2. Seed test accounts
    console.log("\nStarting Seed operation for test accounts...");
    for (const account of testAccounts) {
      console.log(`Creating ${account.email} with role: ${account.role}...`);
      
      const { data: userData, error: createError } = await supabase.auth.admin.createUser({
        email: account.email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
      });

      if (createError) {
        console.error(`Failed to create ${account.email}:`, createError.message);
        continue;
      }

      if (userData?.user) {
        const newUserId = userData.user.id;
        console.log(`Successfully created auth user. UUID: ${newUserId}`);

        // Update the role in the public.users table
        // We use an upsert/update depending on whether a trigger already created the row
        console.log(`Setting role to '${account.role}' for ${account.email}...`);
        
        // Let's try to update first (if trigger exists), otherwise insert
        const { error: updateRoleError } = await supabase
          .from('users')
          .upsert({ 
            id: newUserId, 
            email: account.email,
            full_name: account.role, // Just a placeholder name
            role: account.role
          }, { onConflict: 'id' });

        if (updateRoleError) {
          console.error(`Failed to update role for ${account.email}:`, updateRoleError.message);
        } else {
          console.log(`Role assigned successfully for ${account.email}.`);
        }
      }
    }

    console.log("\nDatabase reset complete.");
  } catch (error) {
    console.error("An unexpected error occurred during wipe & seed:", error);
  }
}

wipeAndSeed();
