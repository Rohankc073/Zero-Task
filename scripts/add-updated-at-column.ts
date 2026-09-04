import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

async function applyMigration() {
  const sql = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20260901000002_add_updated_at_to_users.sql'), 'utf8');
  
  const client = new Client({
    connectionString: 'postgresql://postgres:IdeaTown@364364@db.tevugdwficrmbmfoqpub.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected to Postgres!");

  await client.query(sql);
  await client.query("NOTIFY pgrst, 'reload schema';");
  console.log("Migration 20260901000002 applied successfully!");

  await client.end();
}

applyMigration().catch(console.error);
