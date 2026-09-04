import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function checkFunc() {
  const client = new Client({
    connectionString: 'postgresql://postgres:IdeaTown@364364@db.tevugdwficrmbmfoqpub.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const res = await client.query(`
    SELECT routine_name, routine_definition 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    AND routine_name IN ('is_task_in_user_company', 'is_task_assigned_to_user');
  `);

  console.log("Functions:", res.rows);
  await client.end();
}

checkFunc().catch(console.error);
