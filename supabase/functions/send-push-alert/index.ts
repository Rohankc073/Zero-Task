// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

declare var Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

serve(async (req: Request) => {
  try {
    const payload = await req.json();
    console.log("Incoming pg_net webhook payload:", JSON.stringify(payload));

    const { type, action, record } = payload;

    // We only process INSERT events for the 3 specific tables
    if (action !== "INSERT" || !record) {
      return new Response("Ignored event", { status: 200 });
    }

    let recipientIds: string[] = [];
    let title = "";
    let body = "";
    let dataUrl = "/";

    if (type === "task_assignees") {
      // EVENT: Task Assigned
      const { user_id, task_id } = record;
      if (!user_id || !task_id)
        return new Response("Missing task assignees data", { status: 400 });

      const { data: task } = await supabaseAdmin
        .from("tasks")
        .select("title")
        .eq("id", task_id)
        .single();

      recipientIds = [user_id];
      title = "New Task Assigned";
      body = `"${task?.title || "A task"}" has been assigned to you.`;
      dataUrl = `/task/${task_id}`;
    } else if (type === "meeting_participants") {
      // EVENT: Meeting Scheduled (Participant added)
      const { user_id, meeting_id } = record;
      if (!user_id || !meeting_id)
        return new Response("Missing meeting participant data", {
          status: 400,
        });

      const { data: meeting } = await supabaseAdmin
        .from("meetings")
        .select("title, created_by")
        .eq("id", meeting_id)
        .single();

      recipientIds = [user_id];
      title = "New Meeting Scheduled";
      body = `Meeting: "${meeting?.title || "Untitled Meeting"}"`;
      dataUrl = `/meeting/${meeting_id}`;
    } else if (type === "chat_messages") {
      // EVENT: New Chat Message
      const { channel_id, user_id: sender_id, content } = record;
      if (!channel_id || !sender_id)
        return new Response("Missing chat message data", { status: 400 });

      const { data: channel } = await supabaseAdmin
        .from("chat_channels")
        .select("name, type, department_id")
        .eq("id", channel_id)
        .single();
      const { data: sender } = await supabaseAdmin
        .from("users")
        .select("full_name, email")
        .eq("id", sender_id)
        .single();
      const senderName =
        sender?.full_name || sender?.email?.split("@")[0] || "Someone";

      if (!channel) return new Response("Channel not found", { status: 404 });

      // Determine eligible recipients based on channel type
      if (channel.type === "public") {
        // All users
        const { data: users } = await supabaseAdmin.from("users").select("id");
        recipientIds = (users || []).map((u: any) => u.id);
      } else if (channel.type === "department" && channel.department_id) {
        // Department members
        const { data: users } = await supabaseAdmin
          .from("users")
          .select("id")
          .eq("department_id", channel.department_id);
        recipientIds = (users || []).map((u: any) => u.id);
      } else if (channel.type === "management") {
        // Management users
        const { data: users } = await supabaseAdmin
          .from("users")
          .select("id")
          .in("role", ["Founder", "Department Head", "Manager"]);
        recipientIds = (users || []).map((u: any) => u.id);
      }

      // Remove the sender from the recipients list so they don't get a notification for their own message
      recipientIds = recipientIds.filter((id) => id !== sender_id);

      title = `New Message in ${channel.name}`;
      // Short preview
      const preview =
        content.length > 50 ? content.substring(0, 50) + "..." : content;
      body = `${senderName}: ${preview}`;
      dataUrl = `/chat/${channel_id}`;
    } else if (type === 'chat_channels') {
      // EVENT: New Chat
      const { id: channel_id, name, type: channelType, department_id } = record;
      if (!channel_id) return new Response("Missing chat channel data", { status: 400 });
      
      title = "New Chat Created";
      body = `A new ${channelType} chat "${name || 'Unnamed'}" has been created.`;
      dataUrl = `/chat/${channel_id}`;

      // Determine eligible recipients based on channel type
      if (channelType === 'public') {
        const { data: users } = await supabaseAdmin.from('users').select('id');
        recipientIds = (users || []).map((u: any) => u.id);
      } else if (channelType === 'department' && department_id) {
        const { data: users } = await supabaseAdmin.from('users').select('id').eq('department_id', department_id);
        recipientIds = (users || []).map((u: any) => u.id);
      } else if (channelType === 'management') {
        const { data: users } = await supabaseAdmin.from('users').select('id').in('role', ['Founder', 'Department Head', 'Manager']);
        recipientIds = (users || []).map((u: any) => u.id);
      }
      // Note: chat_channels lacks a created_by field, so we cannot filter out the creator from recipientIds.

    } else {
      return new Response("Unsupported event type", { status: 200 });
    }

    if (recipientIds.length === 0) {
      return new Response("No eligible recipients", { status: 200 });
    }

    // Fetch active push tokens for the recipients
    const { data: tokens, error: tokenError } = await supabaseAdmin
      .from("user_push_tokens")
      .select("id, token, user_id")
      .in("user_id", recipientIds);

    if (tokenError || !tokens || tokens.length === 0) {
      console.log("No push tokens found for recipients");
      return new Response("No push tokens found", { status: 200 });
    }

    console.log(`Sending push to ${tokens.length} devices...`);

    // Prepare Expo push messages
    const messages = tokens.map((t: any) => ({
      to: t.token,
      sound: "default",
      title,
      body,
      data: { url: dataUrl },
    }));

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    console.log("Expo Push Response:", JSON.stringify(result, null, 2));

    // Handle DeviceNotRegistered errors to clean up stale tokens
    if (result.data && Array.isArray(result.data)) {
      const tokensToDelete: string[] = [];
      result.data.forEach((receipt: any, index: number) => {
        if (
          receipt.status === "error" &&
          receipt.details?.error === "DeviceNotRegistered"
        ) {
          tokensToDelete.push(tokens[index].id);
        }
      });

      if (tokensToDelete.length > 0) {
        console.log(
          `Cleaning up ${tokensToDelete.length} unregistered tokens...`,
        );
        await supabaseAdmin
          .from("user_push_tokens")
          .delete()
          .in("id", tokensToDelete);
      }
    }

    return new Response(
      JSON.stringify({ success: true, deliveries: tokens.length }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error sending push notification:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});
