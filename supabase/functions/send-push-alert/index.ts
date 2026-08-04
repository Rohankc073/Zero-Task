// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Declare Deno to prevent TypeScript errors in the editor
declare var Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req: Request) => {
  try {
    const payload = await req.json();
    console.log("Incoming pg_net webhook payload:", JSON.stringify(payload, null, 2));
    const record = payload.record; // The new alert record from the database trigger

    if (!record || !record.user_id) {
      return new Response("No user_id found", { status: 400 });
    }

    const supabaseAdmin = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Fetch the user's expo push token
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("expo_push_token")
      .eq("id", record.user_id)
      .single();

    if (userError || !user || !user.expo_push_token) {
      console.log("No push token found for user", record.user_id);
      return new Response("No push token found", { status: 200 });
    }

    // Send push notification via Expo Push API
    const pushMessage = {
      to: user.expo_push_token,
      sound: "default",
      title: record.title || "New Alert",
      body: record.body || record.message || "You have a new notification.",
      data: { url: record.action_url || "/" },
    };

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pushMessage),
    });

    const result = await response.json();
    console.log("Expo Push Response:", JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.error(`Expo API Error (${response.status}):`, result);
    } else if (result.data && result.data.status === "error") {
      console.error("Expo Push Delivery Error:", result.data.message, result.data.details);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error sending push notification:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});
