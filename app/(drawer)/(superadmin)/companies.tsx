import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { SuperAdminService } from '../../../src/services/admin/SuperAdminService';
import { CreateCompanyModal } from '../../../src/components/admin/CreateCompanyModal';
import { Company } from '../../../src/types';

export default function CompaniesScreen() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [modalVisible, setModalVisible] = useState(false);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const data = await SuperAdminService.getCompanies(searchQuery, statusFilter);
      setCompanies(data);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to fetch companies');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchCompanies();
    }, [statusFilter])
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchCompanies();
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handleToggleStatus = (company: Company) => {
    const newStatus = company.status === 'Active' ? 'Inactive' : 'Active';
    const actionText = newStatus === 'Active' ? 'Activate' : 'Deactivate';

    Alert.alert(
      `${actionText} Company`,
      `Are you sure you want to ${actionText.toLowerCase()} "${company.name}"? ${
        newStatus === 'Inactive'
          ? 'Normal users belonging to this company will not be able to operate while inactive.'
          : 'Users will regain full access to their company workspace.'
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionText,
          style: newStatus === 'Inactive' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await SuperAdminService.updateCompanyStatus(company.id, newStatus);
              fetchCompanies();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to update company status');
            }
          },
        },
      ]
    );
  };

  const handleDeleteCompany = (company: Company) => {
    Alert.alert(
      'Delete Company Permanently',
      `Are you sure you want to permanently delete "${company.name}"?\n\nWARNING: The Founder and all attached user accounts will immediately lose access, and all associated organization data will be permanently deleted. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Company',
          style: 'destructive',
          onPress: async () => {
            try {
              await SuperAdminService.deleteCompany(company.id);
              Alert.alert('Company Deleted', `"${company.name}" and all attached accounts have been permanently deleted.`);
              fetchCompanies();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete company');
            }
          },
        },
      ]
    );
  };

  const renderCompanyItem = ({ item }: { item: Company }) => {
    const founderName = item.founder?.full_name || item.founder?.name || item.founder?.email || 'No Founder Assigned';
    const isCompanyActive = item.status === 'Active';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/(drawer)/(superadmin)/company/${item.id}` as any)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.companyName}>{item.name}</Text>
            <View style={styles.founderRow}>
              <Ionicons name="person-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.founderText}>
                Founder: <Text style={styles.founderHighlight}>{founderName}</Text>
              </Text>
            </View>
            {item.founder?.email && (
              <Text style={styles.founderEmailText}>{item.founder.email}</Text>
            )}
          </View>

          <View style={[styles.statusBadge, isCompanyActive ? styles.statusActive : styles.statusInactive]}>
            <Text style={[styles.statusText, isCompanyActive ? styles.statusTextActive : styles.statusTextInactive]}>
              {item.status || 'Active'}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.dateText}>
            Created: {item.created_at ? new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
          </Text>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.statusToggleBtn, isCompanyActive ? styles.deactivateBtn : styles.activateBtn]}
              onPress={(e) => {
                e.stopPropagation();
                handleToggleStatus(item);
              }}
            >
              <Text style={[styles.statusToggleText, isCompanyActive ? styles.deactivateText : styles.activateText]}>
                {isCompanyActive ? 'Deactivate' : 'Activate'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteIconBtn}
              onPress={(e) => {
                e.stopPropagation();
                handleDeleteCompany(item);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            </TouchableOpacity>

            <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ZeroTask App Header with Drawer Toggle & Logo */}
      <ZeroTaskHeader />

      {/* Page Title & Search Bar */}
      <View style={styles.topSection}>
        <View style={styles.pageTitleRow}>
          <Text style={styles.pageTitle}>Companies</Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.createButtonText}>Create</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search companies or founders..."
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter Chips */}
        <View style={styles.filterChipsRow}>
          {(['All', 'Active', 'Inactive'] as const).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterChip, statusFilter === filter && styles.filterChipActive]}
              onPress={() => setStatusFilter(filter)}
            >
              <Text style={[styles.filterChipText, statusFilter === filter && styles.filterChipTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Companies List */}
      <FlatList
        data={companies}
        renderItem={renderCompanyItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchCompanies}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="business-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No companies found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery || statusFilter !== 'All'
                  ? 'Try adjusting your search or filter criteria.'
                  : 'Start onboarding organizations to the ZeroTask platform.'}
              </Text>
              <TouchableOpacity
                style={styles.emptyCreateBtn}
                onPress={() => setModalVisible(true)}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.emptyCreateBtnText}>Create Company</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          )
        }
      />

      {/* Create Company Modal */}
      <CreateCompanyModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={fetchCompanies}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topSection: {
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: Layout.spacing.sm,
    paddingBottom: Layout.spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDefault,
    gap: Layout.spacing.sm,
  },
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  pageTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xl,
    color: Colors.textPrimary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    borderRadius: Layout.radius.md,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    padding: 0,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: 7,
    borderRadius: Layout.radius.md,
    gap: 4,
  },
  createButtonText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: '#FFFFFF',
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: Layout.spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: 5,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontFamily: Typography.fontFamily.bold,
  },
  listContent: {
    padding: Layout.spacing.lg,
    gap: Layout.spacing.md,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    padding: Layout.spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    gap: Layout.spacing.md,
    ...Layout.shadow.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Layout.spacing.sm,
  },
  companyName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  founderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  founderText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  founderHighlight: {
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
  },
  founderEmailText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Layout.spacing.sm,
    paddingVertical: 4,
    borderRadius: Layout.radius.full,
  },
  statusActive: {
    backgroundColor: Colors.successLight,
  },
  statusInactive: {
    backgroundColor: Colors.dangerLight,
  },
  statusText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 10,
  },
  statusTextActive: {
    color: Colors.successText,
  },
  statusTextInactive: {
    color: Colors.dangerText,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    paddingTop: Layout.spacing.sm,
  },
  dateText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.sm,
  },
  statusToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Layout.radius.sm,
  },
  activateBtn: {
    backgroundColor: Colors.successLight,
  },
  deactivateBtn: {
    backgroundColor: Colors.dangerLight,
  },
  statusToggleText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 10,
  },
  activateText: {
    color: Colors.successText,
  },
  deactivateText: {
    color: Colors.dangerText,
  },
  deleteIconBtn: {
    padding: 4,
    borderRadius: Layout.radius.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  emptyContainer: {
    backgroundColor: Colors.surface,
    padding: Layout.spacing.xxl,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Layout.spacing.sm,
    marginTop: Layout.spacing.md,
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: 8,
    borderRadius: Layout.radius.md,
    marginTop: 8,
  },
  emptyCreateBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: '#FFFFFF',
  },
});
