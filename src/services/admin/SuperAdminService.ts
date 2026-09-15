import { httpClient as apiClient } from '../../adapter/fastapi/httpClient';
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
      apiClient.get<any[]>('/superadmin/companies'),
      apiClient.get<any[]>('/superadmin/founders'),
    ]);

    const companies = companiesRes.data || [];
    const activeCompanies = companies.filter((c: any) => c.status === 'Active').length;
    const inactiveCompanies = companies.filter((c: any) => c.status !== 'Active').length;
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
    let url = '/superadmin/companies';
    const params: string[] = [];
    if (searchQuery) params.push(`search=${encodeURIComponent(searchQuery)}`);
    if (statusFilter && statusFilter !== 'All') params.push(`status_filter=${encodeURIComponent(statusFilter)}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    const res = await apiClient.get<Company[]>(url);
    return res.data || [];
  },

  /**
   * Fetch recent companies for dashboard preview
   */
  async getRecentCompanies(limit = 5): Promise<Company[]> {
    const companies = await this.getCompanies();
    return companies.slice(0, limit);
  },

  /**
   * Fetch specific company details with founder info
   */
  async getCompanyDetails(companyId: string): Promise<any> {
    const res = await apiClient.get<any>(`/superadmin/companies/${companyId}`);
    if (res.error) {
      throw new Error(res.error.message || 'Failed to fetch company details');
    }
    return res.data;
  },

  /**
   * Create a new Company and its Founder user account atomically
   */
  async createCompanyAndFounder(input: CreateCompanyFounderInput): Promise<{
    company: Company;
    founder: User;
    initialPassword?: string;
    companyId: string;
    founderId: string;
    companyName: string;
    founderName: string;
    founderEmail: string;
  }> {
    const res = await apiClient.post<any>('/superadmin/companies', {
      company_name: input.companyName,
      founder_name: input.founderName,
      founder_email: input.founderEmail,
      founder_phone: input.founderPhone || '',
      initial_password: input.initialPassword || 'Test@123',
    });

    if (res.error) {
      throw new Error(res.error.message || 'Failed to create company and founder');
    }

    const data = res.data || {};
    const companyId = data.company_id || data.company?.id || data.id || '';
    const founderId = data.founder_id || data.founder?.id || '';
    const companyName = data.company_name || data.company?.name || input.companyName;
    const founderName = data.founder_name || data.founder?.full_name || data.founder?.name || input.founderName;
    const founderEmail = data.founder_email || data.founder?.email || input.founderEmail;

    return {
      company: data.company || ({ id: companyId, name: companyName, status: 'Active' } as any),
      founder: data.founder || ({ id: founderId, email: founderEmail, full_name: founderName, role: 'Founder' } as any),
      initialPassword: data.initial_password || input.initialPassword,
      companyId,
      founderId,
      companyName,
      founderName,
      founderEmail,
    };
  },

  /**
   * Update company name
   */
  async updateCompanyName(companyId: string, name: string): Promise<any> {
    const res = await apiClient.patch<any>(`/superadmin/companies/${companyId}`, {
      name,
    });
    if (res.error) {
      throw new Error(res.error.message || 'Failed to update company name');
    }
    return res.data;
  },

  /**
   * Update company status
   */
  async updateCompanyStatus(companyId: string, status: 'Active' | 'Inactive'): Promise<any> {
    const res = await apiClient.patch<any>(`/superadmin/companies/${companyId}`, {
      status,
    });
    if (res.error) {
      throw new Error(res.error.message || 'Failed to update company status');
    }
    return res.data;
  },

  /**
   * Toggle company status between Active and Inactive
   */
  async toggleCompanyStatus(companyId: string, currentStatus: string): Promise<Company> {
    const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    return this.updateCompanyStatus(companyId, newStatus);
  },

  /**
   * Hard/Soft delete a company and associated users
   */
  async deleteCompany(companyId: string): Promise<boolean> {
    const res = await apiClient.delete(`/superadmin/companies/${companyId}`);
    if (res.error) {
      throw new Error(res.error.message || 'Failed to delete company');
    }
    return true;
  },

  /**
   * Fetch all founders across the platform
   */
  async getFounders(searchQuery?: string): Promise<any[]> {
    let url = '/superadmin/founders';
    if (searchQuery) url += `?search=${encodeURIComponent(searchQuery)}`;
    const res = await apiClient.get<any[]>(url);
    return res.data || [];
  },

  /**
   * Update Founder account active state
   */
  async updateFounderActiveState(founderId: string, isActive: boolean): Promise<any> {
    const res = await apiClient.patch<any>(`/users/${founderId}`, {
      is_active: isActive,
    });
    if (res.error) {
      throw new Error(res.error.message || 'Failed to update founder status');
    }
    return res.data;
  },

  /**
   * Fetch recent platform-level activity and audit alerts
   */
  async getPlatformAlerts(limit = 50): Promise<PlatformAlert[]> {
    const res = await apiClient.get<PlatformAlert[]>(`/superadmin/alerts?limit=${limit}`);
    return res.data || [];
  },

  /**
   * Fetch all users across companies for SuperAdmin overview
   */
  async getAllPlatformUsers(): Promise<User[]> {
    const res = await apiClient.get<User[]>('/users');
    return res.data || [];
  },
};

