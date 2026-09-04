import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables: EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const SUPERADMIN_EMAIL = 'superadmin@zerotask.com';
const SUPERADMIN_PASSWORD = 'Test@123';

async function emptyBucket(bucketName: string) {
  try {
    const { data: files, error } = await supabase.storage.from(bucketName).list('', { limit: 1000 });
    if (error) {
      console.log(`Bucket '${bucketName}' listing note: ${error.message}`);
      return;
    }
    if (files && files.length > 0) {
      // If folder or files
      const pathsToDelete = files.map(f => f.name);
      const { error: removeError } = await supabase.storage.from(bucketName).remove(pathsToDelete);
      if (removeError) {
        console.warn(`Could not delete files in bucket '${bucketName}':`, removeError.message);
      } else {
        console.log(`Deleted ${pathsToDelete.length} file(s)/folder(s) in bucket '${bucketName}'.`);
      }
    } else {
      console.log(`Bucket '${bucketName}' is already empty.`);
    }
  } catch (err: any) {
    console.warn(`Error emptying bucket '${bucketName}':`, err.message);
  }
}

async function wipeTable(tableName: string, filterCol = 'id') {
  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .neq(filterCol, '00000000-0000-0000-0000-000000000000');

    if (error) {
      console.warn(`Table '${tableName}' wipe warning: ${error.message}`);
    } else {
      console.log(`Cleared table: ${tableName}`);
    }
  } catch (err: any) {
    console.warn(`Error wiping table '${tableName}':`, err.message);
  }
}

async function wipeAllAndCreateSuperAdmin() {
  console.log("=================================================");
  console.log("STARTING FULL SYSTEM WIPE & SUPERADMIN CREATION");
  console.log("=================================================\n");

  // 1. Wipe Storage Buckets
  console.log("--- 1. Wiping Storage Buckets ---");
  const buckets = ['task-audio', 'task-attachments', 'task-files', 'chat-attachments', 'meeting-files', 'audit-logs'];
  for (const bucket of buckets) {
    await emptyBucket(bucket);
  }

  // 2. Wipe Database Tables in Dependency Order
  console.log("\n--- 2. Wiping Database Tables ---");
  const tablesToWipe = [
    'task_voice_notes',
    'task_files',
    'task_attachments',
    'task_assignees',
    'task_milestones',
    'execution_activity',
    'activity_comments',
    'comments',
    'activity_logs',
    'tasks',
    'project_milestones',
    'department_milestones',
    'project_members',
    'projects',
    'meeting_approvals',
    'meeting_participants',
    'meeting_files',
    'meeting_requests',
    'meetings',
    'chat_messages',
    'chat_attachments',
    'chat_channels',
    'user_notes',
    'user_push_tokens',
    'phone_change_requests',
    'password_resets',
    'system_alerts',
    'in_app_notifications',
    'registration_requests',
    'audit_logs',
    'users',
    'designations',
    'departments',
    'companies',
  ];

  for (const tbl of tablesToWipe) {
    await wipeTable(tbl);
  }

  // 3. Wipe all Auth users
  console.log("\n--- 3. Wiping all Auth Users ---");
  try {
    let usersToDelete: { id: string; email?: string }[] = [];
    
    // Try listUsers first
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (!listError && listData?.users) {
      usersToDelete = listData.users.map(u => ({ id: u.id, email: u.email }));
    } else {
      console.warn("auth.admin.listUsers returned error or was empty, fetching from public.users...");
      const { data: pubUsers } = await supabase.from('users').select('id, email');
      if (pubUsers) {
        usersToDelete = pubUsers;
      }
    }

    console.log(`Found ${usersToDelete.length} auth user(s) to delete.`);
    for (const u of usersToDelete) {
      const { error: delError } = await supabase.auth.admin.deleteUser(u.id);
      if (delError) {
        console.warn(`Failed to delete auth user ${u.email || u.id}:`, delError.message);
      } else {
        console.log(`Deleted auth user: ${u.email || u.id}`);
      }
    }
  } catch (err: any) {
    console.warn("Error deleting auth users:", err.message);
  }

  // 4. Create Default Executive Department
  console.log("\n--- 4. Setting up Default Executive Department ---");
  let deptId: string | null = null;
  const { data: deptData, error: deptError } = await supabase
    .from('departments')
    .insert([{ name: 'Executive', description: 'Executive & Administration' }])
    .select('id')
    .single();

  if (deptError) {
    console.warn("Department creation note:", deptError.message);
  } else if (deptData) {
    deptId = deptData.id;
    console.log(`Created default department: Executive (ID: ${deptId})`);
  }

  // 5. Create Super Admin User
  console.log("\n--- 5. Creating Super Admin User ---");
  console.log(`Creating auth user ${SUPERADMIN_EMAIL}...`);

  const { data: createdAuthData, error: createAuthError } = await supabase.auth.admin.createUser({
    email: SUPERADMIN_EMAIL,
    password: SUPERADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: 'Super Admin',
      role: 'Super Admin',
    },
  });

  if (createAuthError) {
    console.error("Failed to create super admin auth user:", createAuthError.message);
    process.exit(1);
  }

  const superAdminId = createdAuthData.user.id;
  console.log(`Auth user created successfully with ID: ${superAdminId}`);

  // Upsert into public.users
  console.log("Upserting into public.users table...");
  const { error: upsertError } = await supabase
    .from('users')
    .upsert({
      id: superAdminId,
      email: SUPERADMIN_EMAIL,
      full_name: 'Super Admin',
      name: 'Super Admin',
      role: 'Super Admin',
      department_id: deptId,
      company_id: null,
      is_active: true,
      is_deleted: false,
      is_approved: true,
      status: 'Approved',
      onboarding_completed: true,
    }, { onConflict: 'id' });

  if (upsertError) {
    console.error("Failed to upsert public.users row:", upsertError.message);
  } else {
    console.log("Super Admin profile created in public.users successfully!");
  }

  console.log("\n=================================================");
  console.log("FULL WIPE & SUPERADMIN CREATION COMPLETED!");
  console.log(`Email: ${SUPERADMIN_EMAIL}`);
  console.log(`Password: ${SUPERADMIN_PASSWORD}`);
  console.log("Role: Super Admin");
  console.log("=================================================");
}

wipeAllAndCreateSuperAdmin().catch((err) => {
  console.error("Fatal error during wipe & seed:", err);
  process.exit(1);
});
