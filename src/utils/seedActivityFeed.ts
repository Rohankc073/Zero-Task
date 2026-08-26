import { supabase } from '../lib/supabase';
import { AuditActionType } from '../types';

export async function seedActivityFeed(currentUserId?: string): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // 1. Fetch available user IDs from public.users to satisfy foreign key constraints
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, full_name, role');

    let availableUserIds: string[] = [];

    if (!usersError && users && users.length > 0) {
      availableUserIds = users.map((u) => u.id);
    } else if (currentUserId) {
      availableUserIds = [currentUserId];
    } else {
      // Fetch current authenticated user if not passed
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id) {
        availableUserIds = [authData.user.id];
      }
    }

    if (availableUserIds.length === 0) {
      return { success: false, count: 0, error: 'No active user accounts found to associate with audit logs.' };
    }

    const getRandomUserId = () => {
      const idx = Math.floor(Math.random() * availableUserIds.length);
      return availableUserIds[idx];
    };

    // Helper to generate a random timestamp within the last 48 hours
    const getRandomPastTimestamp = () => {
      const now = Date.now();
      const fortyEightHoursMs = 48 * 60 * 60 * 1000;
      const randomOffset = Math.floor(Math.random() * fortyEightHoursMs);
      return new Date(now - randomOffset).toISOString();
    };

    // 2. High-value operational operational mock payloads (including mandatory prompt strings)
    const mockSeedTemplates: Array<{ action_type: AuditActionType; description: string }> = [
      // Required Exact String Examples:
      {
        action_type: 'TASK_UPDATE',
        description: 'Deployed AI Front Desk system architecture for City Care Clinic.',
      },
      {
        action_type: 'USER_APPROVED',
        description: 'Approved pending access request for new Engineering Manager.',
      },
      {
        action_type: 'TASK_UPDATE',
        description: 'Successfully executed outreach sequence to 40 local travel agencies.',
      },
      {
        action_type: 'TASK_UPDATE',
        description: 'Pushed frontend website updates for Ambadnya Consultancy portal.',
      },
      {
        action_type: 'MILESTONE_UPDATE',
        description: 'Department target hit: Automated lead capture workflows finalized.',
      },
      {
        action_type: 'TASK_UPDATE',
        description: 'Completed database migration and PL/SQL task batch.',
      },

      // Additional realistic enterprise operations & outreach logic:
      {
        action_type: 'MILESTONE_UPDATE',
        description: 'Achieved 99.9% uptime metric for core notification webhooks.',
      },
      {
        action_type: 'USER_APPROVED',
        description: 'Approved onboarding request for Senior Frontend Architect.',
      },
      {
        action_type: 'TASK_UPDATE',
        description: 'Finalized automated outbound CRM sync engine.',
      },
      {
        action_type: 'TASK_UPDATE',
        description: 'Integrated multi-region failover configuration for production clusters.',
      },
      {
        action_type: 'MILESTONE_UPDATE',
        description: 'Q3 Product Roadmap targets 100% achieved by Engineering team.',
      },
      {
        action_type: 'TASK_UPDATE',
        description: 'Dispatched automated security vulnerability patch to internal services.',
      },
      {
        action_type: 'USER_APPROVED',
        description: 'Approved department transfer for Product Operations Lead.',
      },
      {
        action_type: 'TASK_UPDATE',
        description: 'Optimized PostgreSQL indexing strategy reducing query latency by 45%.',
      },
      {
        action_type: 'MILESTONE_UPDATE',
        description: 'Enterprise Client Onboarding milestone completed ahead of deadline.',
      },
      {
        action_type: 'TASK_UPDATE',
        description: 'Configured end-to-end automated log aggregation pipeline.',
      },
      {
        action_type: 'TASK_UPDATE',
        description: 'Completed code review and merge for multi-tenant data isolation layer.',
      },
      {
        action_type: 'USER_APPROVED',
        description: 'Approved system access privileges for Security Operations Team.',
      },
    ];

    // Build array of 18 records with randomized timestamps
    const rowsToInsert = mockSeedTemplates.map((item) => ({
      user_id: getRandomUserId(),
      action_type: item.action_type,
      description: item.description,
      created_at: getRandomPastTimestamp(),
    }));

    // 3. Bulk insert into Supabase audit_logs table
    const { error: insertError } = await supabase.from('audit_logs').insert(rowsToInsert);

    if (insertError) {
      console.error('Error seeding audit logs:', insertError);
      return { success: false, count: 0, error: insertError.message };
    }

    return { success: true, count: rowsToInsert.length };
  } catch (err: any) {
    console.error('Exception in seedActivityFeed:', err);
    return { success: false, count: 0, error: err.message || 'Unknown error seeding activity feed' };
  }
}
