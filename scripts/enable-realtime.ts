import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function enableRealtime() {
  const client = new Client({
    connectionString: 'postgresql://postgres:IdeaTown@364364@db.tevugdwficrmbmfoqpub.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected to Postgres!");

  // Ensure tables are in supabase_realtime publication
  const tables = ['companies', 'users', 'tasks', 'departments', 'designations', 'audit_logs', 'meetings', 'chat_messages'];
  
  for (const tbl of tables) {
    try {
      await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE public.${tbl};`);
      console.log(`Added ${tbl} to supabase_realtime publication.`);
    } catch (err: any) {
      if (err.message.includes('already in publication')) {
        console.log(`${tbl} is already in supabase_realtime publication.`);
      } else {
        console.warn(`Could not add ${tbl}:`, err.message);
      }
    }
  }

  await client.end();
  console.log("Done enabling realtime publication.");
}

enableRealtime().catch(console.error);
