import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function check() {
  const client = new Client({
    connectionString: 'postgresql://postgres:IdeaTown@364364@db.tevugdwficrmbmfoqpub.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const policies = await client.query(`
    SELECT tablename, policyname, cmd, qual 
    FROM pg_policies 
    WHERE tablename IN ('tasks', 'task_assignees')
  `);

  console.log("=== POLICIES ON TASKS & TASK_ASSIGNEES ===");
  for (const row of policies.rows) {
    console.log(`[${row.tablename}] ${row.policyname} (${row.cmd}): ${row.qual}`);
  }

  await client.end();
}

check().catch(console.error);
