import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface EscalationPayload {
  task_id?: string;
  user_id: string; // The user who triggered or missed the action
  action: 'missed_deadline' | 'task_completed' | 'meeting_request' | 'general_alert';
  message: string;
}

serve(async (req) => {
  try {
    const payload: EscalationPayload = await req.json();
    console.log("Processing escalation payload:", payload);

    // Get the user's info to determine the escalation path
    const { data: user } = await supabase
      .from('users')
      .select('id, role, department_id, full_name')
      .eq('id', payload.user_id)
      .single();

    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 400 });
    }

    let notifyIds: string[] = [];

    // Escalation Matrix Logic
    if (payload.action === 'missed_deadline') {
      if (user.role === 'Employee') {
        // Escalate to Manager of the same department
        const { data: managers } = await supabase
          .from('users')
          .select('id')
          .eq('department_id', user.department_id)
          .eq('role', 'Manager');
        notifyIds = managers?.map(m => m.id) || [];
      } else if (user.role === 'Manager') {
        // Escalate to Department Head
        const { data: heads } = await supabase
          .from('users')
          .select('id')
          .eq('department_id', user.department_id)
          .eq('role', 'Department Head');
        notifyIds = heads?.map(h => h.id) || [];
      } else if (user.role === 'Department Head') {
        // Escalate to Founder
        const { data: founders } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'Founder');
        notifyIds = founders?.map(f => f.id) || [];
      }
    } else if (payload.action === 'meeting_request') {
      // General routing based on payload logic could be handled similarly
      // Default fallback
      notifyIds = [payload.user_id];
    } else {
      // General notification to self
      notifyIds = [payload.user_id];
    }

    // Always notify founders for missed deadlines at high levels
    if (payload.action === 'missed_deadline' && user.role !== 'Employee') {
       const { data: founders } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'Founder');
       if (founders) {
         notifyIds = [...new Set([...notifyIds, ...founders.map(f => f.id)])];
       }
    }

    // Insert notifications
    if (notifyIds.length > 0) {
      const notifications = notifyIds.map(id => ({
        user_id: id,
        title: `System Alert: ${payload.action}`,
        body: payload.message,
        is_read: false
      }));

      const { error } = await supabase.from('notifications').insert(notifications);
      if (error) throw error;
      
      // Phase 7: WhatsApp Integration (Stub)
      // fetch('https://whatsapp-api-gateway...', { method: 'POST', body: JSON.stringify(notifications) });
    }

    return new Response(JSON.stringify({ success: true, escalated_to: notifyIds }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error processing escalation:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
