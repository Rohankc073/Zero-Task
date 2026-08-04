import { createClient } from '@supabase/supabase-js';

try {
  require('dotenv').config();
} catch (e) {}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const departmentsToSeed = [
  { name: 'Finance' },
  { name: 'Marketing' },
  { name: 'Research' },
  { name: 'IT' }
];

async function seedDepartments() {
  console.log('Seeding basic departments...');
  
  for (const dept of departmentsToSeed) {
    const { data: existing } = await supabase
      .from('departments')
      .select('*')
      .eq('name', dept.name)
      .single();
      
    if (!existing) {
      console.log(`Inserting ${dept.name}...`);
      const { error } = await supabase
        .from('departments')
        .insert([dept]);
        
      if (error) {
        console.error(`Error inserting ${dept.name}:`, error.message);
      }
    } else {
      console.log(`${dept.name} already exists, skipping.`);
    }
  }
  
  console.log('Done.');
}

seedDepartments().catch(console.error);
