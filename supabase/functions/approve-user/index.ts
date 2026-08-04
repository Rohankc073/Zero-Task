// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Initialize Supabase client using Service Role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // 2. Extract Authorization header from incoming request to identify the caller
    const authHeader = req.headers.get('Authorization')!
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Verify caller's JWT
    const { data: { user: caller }, error: callerError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (callerError || !caller) {
      throw new Error('Unauthorized caller')
    }

    // Get caller's role from public.users table
    const { data: callerData, error: callerDataError } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .single()
      
    if (callerDataError || !callerData) {
      throw new Error('Caller role not found')
    }
    
    const callerRole = callerData.role

    // 3. Parse request body
    const { request_id } = await req.json()
    if (!request_id) {
      throw new Error('Missing request_id')
    }

    // 4. Fetch the registration request details
    const { data: regRequest, error: regError } = await supabaseClient
      .from('registration_requests')
      .select('*')
      .eq('id', request_id)
      .single()

    if (regError || !regRequest) {
      throw new Error('Registration request not found')
    }

    if (regRequest.status !== 'Pending') {
      throw new Error('Request is no longer pending')
    }

    // 5. Verify authorization based on hierarchical rules
    const requestedRole = regRequest.requested_role
    let isAuthorized = false

    if (callerRole === 'Founder') {
      isAuthorized = true // Founders can approve anyone
    } else if (callerRole === 'Department Head' && (requestedRole === 'Manager' || requestedRole === 'Employee')) {
      isAuthorized = true
    } else if (callerRole === 'Manager' && requestedRole === 'Employee') {
      isAuthorized = true
    }

    if (!isAuthorized) {
      throw new Error('Caller is not authorized to approve this role')
    }

    // 6. Create the user in Auth system using admin API
    // We generate an invite link so the user can set their password
    const { data: newUser, error: createError } = await supabaseClient.auth.admin.inviteUserByEmail(
      regRequest.email,
      {
        data: { role: requestedRole } // Optional user metadata
      }
    )

    if (createError) {
      throw new Error(`Auth creation failed: ${createError.message}`)
    }

    // Wait, inviteUserByEmail might not trigger public.users insertion if the trigger expects password, 
    // but typically a trigger inserts into public.users. 
    // Let's ensure the role is updated in public.users immediately in case the trigger runs.
    
    // Auth trigger creates public.users row with default 'Employee' role.
    // We update it to the requested role here.
    if (newUser?.user?.id) {
      const { error: updateError } = await supabaseClient
        .from('users')
        .update({ role: requestedRole })
        .eq('id', newUser.user.id)
        
      if (updateError) {
        console.error('Failed to update public user role:', updateError)
      }
    }

    // 7. Update registration_requests to Approved
    const { error: approveUpdateError } = await supabaseClient
      .from('registration_requests')
      .update({ status: 'Approved', updated_at: new Date().toISOString() })
      .eq('id', request_id)

    if (approveUpdateError) {
        throw new Error('Failed to update registration status')
    }

    return new Response(
      JSON.stringify({ success: true, message: 'User approved and invited successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
