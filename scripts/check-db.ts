import { createClient } from '@supabase/supabase-js';

try { require('dotenv').config(); } catch (e) {}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkTriggers() {
  const { data, error } = await supabase.rpc('mock_checkout', { org_name: 'test' });
  // Instead of checking trigger directly, let's just see if in_app_notifications table exists
  const { error: tblError } = await supabase.from('in_app_notifications').select('id').limit(1);
  if (tblError) {
    console.error("Table check error:", tblError.message);
  } else {
    console.log("in_app_notifications table exists!");
  }
}
checkTriggers();
