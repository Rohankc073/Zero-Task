import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/context/AuthContext';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { CompanyFilterSelector } from '../../../src/components/CompanyFilterSelector';
import { User, Company, Department, Designation } from '../../../src/types';

interface GroupedUsers {
  companyId: string;
  companyName: string;
  companyCode?: string;
  users: User[];
}

export default function SuperAdminCurrentUsersScreen() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Record<string, Company>>({});
  const [departments, setDepartments] = useState<Record<string, Department>>({});
  const [designations, setDesignations] = useState<Record<string, Designation>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Read-Only Modal State
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);

  // Fetch Directory Data
  const fetchDirectory = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);

      // 1. Companies
      const { data: compData } = await supabase.from('companies').select('*').order('name');
      const cMap = (compData || []).reduce((acc, c) => {
        acc[c.id] = c;
        return acc;
      }, {} as Record<string, Company>);
      setCompanies(cMap);

      // 2. Departments
      const { data: deptData } = await supabase.from('departments').select('*').order('name');
      const dMap = (deptData || []).reduce((acc, d) => {
        acc[d.id] = d;
        return acc;
      }, {} as Record<string, Department>);
      setDepartments(dMap);

      // 3. Designations
      const { data: desData } = await supabase.from('designations').select('*').order('name');
      const desMap = (desData || []).reduce((acc, des) => {
        acc[des.id] = des;
        return acc;
      }, {} as Record<string, Designation>);
      setDesignations(desMap);

      // 4. All Users (exclude Super Admins from company users directory)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('is_deleted', false)
        .neq('role', 'Super Admin')
        .order('full_name');

      if (userError) throw userError;
      setUsers((userData as User[]) || []);
    } catch (err: any) {
      console.error('Error fetching global users directory:', err);
      Alert.alert('Error', 'Failed to fetch global user directory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDirectory(true);
    }, [fetchDirectory])
  );

  useEffect(() => {
    fetchDirectory();

    const channelId = `sa_users_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        () => {
          fetchDirectory(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'companies' },
        () => {
          fetchDirectory(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'departments' },
        () => {
          fetchDirectory(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'designations' },
        () => {
          fetchDirectory(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDirectory]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDirectory();
  };

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Exclude Super Admin from company users directory
      if (u.role === 'Super Admin') {
        return false;
      }

      // Company Filter
      if (selectedCompanyId && u.company_id !== selectedCompanyId) {
        return false;
      }

      // Role Filter
      if (roleFilter !== 'All' && u.role !== roleFilter) {
        return false;
      }

      // Search Query (Name, Email, Designation)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (u.full_name || (u as any).name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const role = (u.role || '').toLowerCase();
        const desig = u.designation_id ? (designations[u.designation_id]?.name || '').toLowerCase() : '';
        const dept = u.department_id ? (departments[u.department_id]?.name || '').toLowerCase() : '';

        if (!name.includes(q) && !email.includes(q) && !role.includes(q) && !desig.includes(q) && !dept.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [users, selectedCompanyId, roleFilter, searchQuery, designations, departments]);

  // Group filtered users by company
  const groupedUsers = useMemo(() => {
    const map: Record<string, GroupedUsers> = {};

    filteredUsers.forEach((u) => {
      const cId = u.company_id || 'no_company';
      if (!map[cId]) {
        const comp = u.company_id ? companies[u.company_id] : null;
        map[cId] = {
          companyId: cId,
          companyName: comp ? comp.name : 'Unassigned / Global Platform',
          companyCode: comp ? comp.code : undefined,
          users: [],
        };
      }
      map[cId].users.push(u);
    });

    const groups = Object.values(map);
    return groups.sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [filteredUsers, companies]);

  // Open Details Modal
  const handleOpenDetails = (user: User) => {
    setSelectedUser(user);
    setDetailsModalVisible(true);
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'Super Admin':
        return { bg: '#FEE2E2', text: '#DC2626' };
      case 'Founder':
        return { bg: '#FEF3C7', text: '#D97706' };
      case 'Department Head':
        return { bg: '#E0E7FF', text: '#4338CA' };
      case 'Manager':
        return { bg: '#DCFCE7', text: '#15803D' };
      default:
        return { bg: '#F1F5F9', text: '#475569' };
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ZeroTaskHeader />

      {/* Header Bar */}
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.title}>Current Users Directory</Text>
          <Text style={styles.subtitle}>Global multi-company user management & oversight</Text>
        </View>
      </View>

      {/* Filter Toolbar */}
      <View style={styles.filterSection}>
        {/* Company Dropdown Filter */}
        <View style={styles.companyFilter}>
          <CompanyFilterSelector
            selectedCompanyId={selectedCompanyId}
            onSelectCompany={(cId) => setSelectedCompanyId(cId)}
            showAllOption
            allOptionLabel="All Companies"
          />
        </View>

        {/* Search Input */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, email, role, department..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Role Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rolePillsScroll}>
          {(['All', 'Founder', 'Department Head', 'Manager', 'Employee'] as const).map((r) => {
            const isSelected = roleFilter === r;
            return (
              <TouchableOpacity
                key={r}
                style={[styles.rolePill, isSelected && styles.rolePillActive]}
                onPress={() => setRoleFilter(r)}
                activeOpacity={0.7}
              >
                <Text style={[styles.rolePillText, isSelected && styles.rolePillTextActive]}>{r}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* User Directory List */}
      {loading && !refreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading users across organizations...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {groupedUsers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No Users Found</Text>
              <Text style={styles.emptySubtitle}>Try adjusting your search query or company filter</Text>
            </View>
          ) : (
            groupedUsers.map((group, groupIdx) => (
              <View key={group.companyId || `company_${groupIdx}`} style={styles.companySection}>
                {/* Company Group Header */}
                <View style={styles.companySectionHeader}>
                  <View style={styles.companySectionLeft}>
                    <Ionicons name="business" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
                    <Text style={styles.companySectionTitle}>{group.companyName}</Text>
                  </View>
                  <View style={styles.userCountBadge}>
                    <Text style={styles.userCountBadgeText}>{group.users.length}</Text>
                  </View>
                </View>

                {/* User Cards in Company */}
                {group.users.map((user, userIdx) => {
                  const displayName = user.full_name || (user as any).name || user.email || 'User';
                  const initial = displayName.charAt(0).toUpperCase();
                  const dept = user.department_id ? departments[user.department_id]?.name : null;
                  const desig = user.designation_id ? designations[user.designation_id]?.name : null;
                  const isActive = user.is_active !== false;

                  return (
                    <TouchableOpacity
                      key={user.id || `user_${userIdx}`}
                      style={[styles.userCard, !isActive && styles.userCardInactive]}
                      onPress={() => handleOpenDetails(user)}
                      activeOpacity={0.7}
                    >
                      {/* Avatar */}
                      <View style={[styles.avatar, !isActive && { backgroundColor: Colors.surfaceSubtle }]}>
                        <Text style={[styles.avatarText, !isActive && { color: Colors.textMuted }]}>
                          {initial}
                        </Text>
                      </View>

                      {/* Info */}
                      <View style={styles.userInfo}>
                        <View style={styles.userTopRow}>
                          <Text style={[styles.userName, !isActive && styles.userNameInactive]}>
                            {displayName}
                          </Text>
                          {!isActive && (
                            <View style={styles.inactiveBadge}>
                              <Text style={styles.inactiveBadgeText}>INACTIVE</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.userEmail}>{user.email}</Text>

                        {/* Meta Tags */}
                        <View style={styles.userMetaRow}>
                          <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor(user.role).bg }]}>
                            <Text style={[styles.roleBadgeText, { color: getRoleBadgeColor(user.role).text }]}>
                              {user.role}
                            </Text>
                          </View>
                          {dept && (
                            <View style={styles.metaBadge}>
                              <Text style={styles.metaBadgeText}>{dept}</Text>
                            </View>
                          )}
                          {desig && (
                            <View style={styles.metaBadge}>
                              <Text style={styles.metaBadgeText}>{desig}</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Info / Chevron Icon */}
                      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Read-Only User Details Modal */}
      <Modal visible={detailsModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>User Details</Text>
              <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedUser && (
              <ScrollView contentContainerStyle={styles.modalContent}>
                {/* User Overview Box */}
                <View style={styles.profileHeaderBox}>
                  <View style={styles.modalAvatar}>
                    <Text style={styles.modalAvatarText}>
                      {(selectedUser.full_name || selectedUser.email || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.modalUserName}>{selectedUser.full_name || (selectedUser as any).name || 'User'}</Text>
                  <Text style={styles.modalUserEmail}>{selectedUser.email}</Text>
                  <View style={styles.companyTag}>
                    <Ionicons name="business-outline" size={13} color={Colors.primary} style={{ marginRight: 4 }} />
                    <Text style={styles.companyTagText}>
                      {selectedUser.company_id && companies[selectedUser.company_id]
                        ? companies[selectedUser.company_id].name
                        : 'Unassigned Company'}
                    </Text>
                  </View>
                </View>

                {/* Read-Only Information Table */}
                <View style={styles.detailsBox}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>System Role</Text>
                    <View style={[styles.roleBadge, { backgroundColor: getRoleBadgeColor(selectedUser.role).bg }]}>
                      <Text style={[styles.roleBadgeText, { color: getRoleBadgeColor(selectedUser.role).text }]}>
                        {selectedUser.role}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailDivider} />

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Department</Text>
                    <Text style={styles.detailValue}>
                      {selectedUser.department_id && departments[selectedUser.department_id]
                        ? departments[selectedUser.department_id].name
                        : 'None'}
                    </Text>
                  </View>

                  <View style={styles.detailDivider} />

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Designation</Text>
                    <Text style={styles.detailValue}>
                      {selectedUser.designation_id && designations[selectedUser.designation_id]
                        ? designations[selectedUser.designation_id].name
                        : 'None'}
                    </Text>
                  </View>

                  <View style={styles.detailDivider} />

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Account Status</Text>
                    <View style={styles.statusIndicatorRow}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: selectedUser.is_active !== false ? Colors.success : Colors.error },
                        ]}
                      />
                      <Text
                        style={[
                          styles.detailValue,
                          { color: selectedUser.is_active !== false ? Colors.success : Colors.error, fontFamily: Typography.fontFamily.semiBold },
                        ]}
                      >
                        {selectedUser.is_active !== false ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>

                  {selectedUser.created_at ? (
                    <View key="member_since_section">
                      <View style={styles.detailDivider} />
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Member Since</Text>
                        <Text style={styles.detailValue}>
                          {new Date(selectedUser.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                {/* Governance Notice */}
                <View style={styles.noticeBox}>
                  <Ionicons name="information-circle" size={16} color={Colors.primary} style={{ marginRight: 8, marginTop: 1 }} />
                  <Text style={styles.noticeText}>
                    Roles, departments, and designations are managed exclusively by company Founders within their organization.
                  </Text>
                </View>

                {/* Close Button */}
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setDetailsModalVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  headerBar: {
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  filterSection: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  companyFilter: {
    marginBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    paddingHorizontal: 10,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    height: 38,
    marginBottom: 8,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  rolePillsScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  rolePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  rolePillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  rolePillText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  rolePillTextActive: {
    color: Colors.textInverse,
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    padding: Layout.spacing.lg,
    paddingBottom: 40,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    marginTop: 12,
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginTop: 4,
  },
  companySection: {
    marginBottom: 20,
  },
  companySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  companySectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  companySectionTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 13,
    color: Colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userCountBadge: {
    backgroundColor: Colors.surfaceRaised,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  userCountBadgeText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 8,
  },
  userCardInactive: {
    opacity: 0.6,
    backgroundColor: Colors.canvas,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 16,
    color: Colors.primary,
  },
  userInfo: {
    flex: 1,
  },
  userTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  userNameInactive: {
    color: Colors.textMuted,
  },
  inactiveBadge: {
    marginLeft: 6,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  inactiveBadgeText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 9,
    color: Colors.danger,
  },
  userEmail: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 10,
  },
  metaBadge: {
    backgroundColor: Colors.surfaceRaised,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  metaBadgeText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 10,
    color: Colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  modalContent: {
    padding: 16,
  },
  profileHeaderBox: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  modalAvatarText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 24,
    color: Colors.primary,
  },
  modalUserName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  modalUserEmail: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  companyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  companyTagText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 11,
    color: Colors.primary,
  },
  detailsBox: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  detailLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderSubtle,
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: Layout.radius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 20,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.regular,
    lineHeight: 17,
  },
  closeBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: Layout.radius.md,
    alignItems: 'center',
  },
  closeBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textInverse,
  },
});
