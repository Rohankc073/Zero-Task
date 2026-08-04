import { supabase } from './supabase';
import { UserRole } from '../types';

export const AuthService = {
  /**
   * Submits a new registration request via the custom RPC
   * @param email The user's email address
   * @param role The requested role
   * @returns Result of the RPC call or an error
   */
  async submitRegistrationRequest(email: string, role: UserRole) {
    const { data, error } = await supabase.rpc('submit_registration_request', {
      p_email: email,
      p_role: role,
    });
    
    if (error) {
      throw error;
    }
    
    return data;
  },

  /**
   * Approves a registration request by calling the Supabase Edge Function
   * @param requestId The ID of the registration_requests row
   * @returns Result of the Edge Function call
   */
  async approveRegistrationRequest(requestId: string) {
    const { data, error } = await supabase.functions.invoke('approve-user', {
      body: { request_id: requestId },
    });

    if (error) {
      throw new Error(error.message || 'Failed to approve request.');
    }

    return data;
  },

  /**
   * Rejects a registration request
   * @param requestId The ID of the registration_requests row
   */
  async rejectRegistrationRequest(requestId: string) {
    const { error } = await supabase
      .from('registration_requests')
      .update({ 
        status: 'Rejected', 
        rejected_at: new Date().toISOString() 
      })
      .eq('id', requestId);

    if (error) {
      throw error;
    }
    
    return true;
  }
};
