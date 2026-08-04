import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    // Create a Supabase client with the user's auth context
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { taskId, userId } = await req.json();

    if (!taskId || !userId) {
      throw new Error('taskId and userId are required');
    }

    // 1. Get the user's Google Calendar access token
    const { data: integration, error: integrationError } = await supabase
      .from('user_integrations')
      .select('gcal_access_token')
      .eq('user_id', userId)
      .single();

    if (integrationError || !integration?.gcal_access_token) {
      throw new Error('Google Calendar integration missing or unauthenticated.');
    }

    // 2. Fetch task details
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      throw new Error('Task not found.');
    }

    // 3. Format the event for Google Calendar
    const event = {
      summary: `[ZeroTask Deadline] ${task.title}`,
      description: task.description || 'Synced securely from ZeroTask Edge Functions.',
      start: {
        dateTime: new Date().toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: task.due_date ? new Date(task.due_date).toISOString() : new Date(Date.now() + 3600000).toISOString(),
        timeZone: 'UTC',
      },
    };

    // 4. Post to Google Calendar API directly
    const gcalResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.gcal_access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    });

    if (!gcalResponse.ok) {
      const errText = await gcalResponse.text();
      throw new Error(`GCal Sync Failed: ${errText}`);
    }

    const gcalData = await gcalResponse.json();

    return new Response(JSON.stringify({ success: true, event: gcalData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
