import { supabase } from '../../lib/supabase';
import { Company, User } from '../../types';

export interface PlatformMetrics {
  totalCompanies: number;
  activeCompanies: number;
  inactiveCompanies: number;
  totalFounders: number;
}

export interface CreateCompanyFounderInput {
  companyName: string;
  founderName: string;
  founderEmail: string;
  founderPhone?: string;
  initialPassword?: string;
}

export interface PlatformAlert {
  id: string;
  action_type: string;
  description: string;
  created_at: string;
  company_id?: string;
}

export const SuperAdminService = {
  /**
   * Get high-level platform administration metrics
   */
  async getPlatformMetrics(): Promise<PlatformMetrics> {
    const [companiesRes, foundersRes] = await Promise.all([
      supabase.from('companies').select('id, status'),
      supabase.from('users').select('id, role').eq('role', 'Founder')
    ]);

    const companies = companiesRes.data || [];
    const activeCompanies = companies.filter(c => c.status === 'Active').length;
    const inactiveCompanies = companies.filter(c => c.status !== 'Active').length;
    const totalFounders = (foundersRes.data || []).length;

    return {
      totalCompanies: companies.length,
      activeCompanies,
      inactiveCompanies,
      totalFounders,
    };
  },

  /**
   * Fetch all companies with Founder details, optional search and status filter
   */
  async getCompanies(searchQuery?: string, statusFilter?: 'All' | 'Active' | 'Inactive'): Promise<Company[]> {
    let query = supabase
      .from('companies')
      .select(`
        *,
        founder:users!users_company_id_fkey (
          id, name, full_name, email, phone_number, role, is_active, status
        )
      `)
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'All') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    let companies = (data || []).map(company => {
      const founderUser = Array.isArray(company.founder)
        ? company.founder.find((u: any) => u.role === 'Founder')
        : company.founder;
      return {
        ...company,
        founder: founderUser,
      };
    });

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      companies = companies.filter(c => 
        c.name?.toLowerCase().includes(q) ||
        c.founder?.full_name?.toLowerCase().includes(q) ||
        c.founder?.name?.toLowerCase().includes(q) ||
        c.founder?.email?.toLowerCase().includes(q)
      );
    }

    return companies;
  },

  /**
   * Fetch recent companies for dashboard preview
   */
  async getRecentCompanies(limit = 5): Promise<Company[]> {
    const { data, error } = await supabase
      .from('companies')
      .select(`
        *,
        founder:users!users_company_id_fkey (
          id, name, full_name, email, phone_number, role, is_active, status
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data || []).map(company => ({
      ...company,
      founder: Array.isArray(company.founder)
        ? company.founder.find((u: any) => u.role === 'Founder')
        : company.founder,
    }));
  },

  /**
   * Fetch specific company details with founder info
   */
  async getCompanyDetails(companyId: string): Promise<any> {
    const { data, error } = await supabase
      .from('companies')
      .select(`
        *,
        founder:users!users_company_id_fkey (
          id, name, full_name, email, phone_number, role, is_active, status, created_at
        )
      `)
      .eq('id', companyId)
      .single();

    if (error) throw error;

    const founder = Array.isArray(data.founder)
      ? data.founder.find((u: any) => u.role === 'Founder')
      : data.founder;

    return { ...data, founder };
  },

  /**
   * Create Company and initial Founder account atomically via Server-Side Database RPC
   * NEVER alters or affects the caller's active authentication session.
   */
  async createCompanyAndFounder(input: CreateCompanyFounderInput): Promise<{ companyId: string; founderId: string; companyName: string; founderEmail: string; founderName: string }> {
    const { companyName, founderName, founderEmail, founderPhone, initialPassword } = input;

    const { data, error } = await supabase.rpc('create_company_and_founder', {
      p_company_name: companyName.trim(),
      p_founder_name: founderName.trim(),
      p_founder_email: founderEmail.toLowerCase().trim(),
      p_founder_phone: founderPhone ? founderPhone.trim() : '',
      p_founder_password: initialPassword || 'Test@123',
    });

    if (error) {
      throw new Error(error.message || 'Failed to create company and founder account');
    }

    const res = typeof data === 'string' ? JSON.parse(data) : data;
    return {
      companyId: res.company_id,
      founderId: res.founder_id,
      companyName: res.company_name,
      founderName: res.founder_name,
      founderEmail: res.founder_email,
    };
  },

  /**
   * Update company name
   */
  async updateCompanyName(companyId: string, name: string) {
    const { data, error } = await supabase
      .from('companies')
      .update({ name: name.trim() })
      .eq('id', companyId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Activate or Deactivate company
   */
  async updateCompanyStatus(companyId: string, status: 'Active' | 'Inactive') {
    const { data, error } = await supabase
      .from('companies')
      .update({ status })
      .eq('id', companyId)
      .select()
      .single();

    if (error) throw error;

    // Log in platform audit
    await supabase.from('audit_logs').insert({
      action_type: status === 'Active' ? 'COMPANY_ACTIVATED' : 'COMPANY_DEACTIVATED',
      target_type: 'company',
      target_id: companyId,
      description: `Company status changed to ${status}`,
      company_id: companyId,
    });

    return data;
  },

  /**
   * Permanently delete company and all attached users/accounts
   */
  async deleteCompany(companyId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_company_and_users', {
      p_company_id: companyId,
    });

    if (error) {
      throw new Error(error.message || 'Failed to delete company and attached accounts');
    }
  },

  /**
   * Fetch all founders across the platform
   */
  async getFounders(searchQuery?: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id, email, full_name, name, phone_number, role, is_active, status, created_at, company_id,
        company:companies (
          id, name, status
        )
      `)
      .eq('role', 'Founder')
      .order('created_at', { ascending: false });

    if (error) throw error;

    let founders = data || [];
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      founders = founders.filter(f => 
        f.full_name?.toLowerCase().includes(q) ||
        f.name?.toLowerCase().includes(q) ||
        f.email?.toLowerCase().includes(q) ||
        (f.company as any)?.name?.toLowerCase().includes(q)
      );
    }

    return founders;
  },

  /**
   * Update Founder account active state
   */
  async updateFounderActiveState(founderId: string, isActive: boolean) {
    const { data, error } = await supabase
      .from('users')
      .update({ 
        is_active: isActive,
        status: isActive ? 'Approved' : 'Pending'
      })
      .eq('id', founderId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get platform alerts
   */
  async getPlatformAlerts(limit = 50): Promise<PlatformAlert[]> {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, action_type, description, created_at, company_id')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }
};
