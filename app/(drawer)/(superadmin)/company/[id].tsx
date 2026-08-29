import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../../../src/components/ui/Header';
import { Colors, Typography, Layout } from '../../../../src/theme/tokens';
import { SuperAdminService } from '../../../../src/services/admin/SuperAdminService';

export default function CompanyDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchCompanyDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await SuperAdminService.getCompanyDetails(id as string);
      setCompany(data);
      setNewCompanyName(data.name || '');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to fetch company details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanyDetails();
  }, [id]);

  const handleToggleCompanyStatus = () => {
    if (!company) return;
    const newStatus = company.status === 'Active' ? 'Inactive' : 'Active';
    const actionText = newStatus === 'Active' ? 'Activate' : 'Deactivate';

    Alert.alert(
      `${actionText} Company`,
      `Are you sure you want to ${actionText.toLowerCase()} "${company.name}"? ${
        newStatus === 'Inactive'
          ? 'Normal operational users in this company will be restricted from accessing workspaces until reactivated.'
          : 'Normal operations and workspace access will be restored.'
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionText,
          style: newStatus === 'Inactive' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setUpdating(true);
              await SuperAdminService.updateCompanyStatus(company.id, newStatus);
              setCompany((prev: any) => ({ ...prev, status: newStatus }));
              Alert.alert('Success', `Company has been ${newStatus.toLowerCase()}d.`);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to update company status');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleSaveCompanyName = async () => {
    if (!newCompanyName.trim()) {
      Alert.alert('Validation Error', 'Company name cannot be empty.');
      return;
    }

    try {
      setUpdating(true);
      await SuperAdminService.updateCompanyName(company.id, newCompanyName.trim());
      setCompany((prev: any) => ({ ...prev, name: newCompanyName.trim() }));
      setEditModalVisible(false);
      Alert.alert('Updated', 'Company name updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update company name');
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleFounderStatus = () => {
    if (!company?.founder) return;
    const isCurrentlyActive = company.founder.is_active !== false;
    const actionText = isCurrentlyActive ? 'Deactivate' : 'Activate';

    Alert.alert(
      `${actionText} Founder Account`,
      `Are you sure you want to ${actionText.toLowerCase()} the Founder account for "${company.founder.full_name || company.founder.email}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionText,
          style: isCurrentlyActive ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setUpdating(true);
              await SuperAdminService.updateFounderActiveState(company.founder.id, !isCurrentlyActive);
              setCompany((prev: any) => ({
                ...prev,
                founder: {
                  ...prev.founder,
                  is_active: !isCurrentlyActive,
                  status: !isCurrentlyActive ? 'Approved' : 'Pending',
                },
              }));
              Alert.alert('Success', `Founder account has been ${actionText.toLowerCase()}d.`);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to update founder account');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteCompany = () => {
    if (!company) return;

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
              setUpdating(true);
              await SuperAdminService.deleteCompany(company.id);
              Alert.alert('Company Deleted', `"${company.name}" and all attached accounts have been permanently deleted.`);
              router.replace('/(drawer)/(superadmin)/companies' as any);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete company');
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header title="Company Details" showBack />
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!company) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header title="Company Details" showBack />
        <View style={styles.centerLoading}>
          <Text style={styles.errorText}>Company not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isCompanyActive = company.status === 'Active';
  const founder = company.founder;
  const isFounderActive = founder ? founder.is_active !== false : false;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header title="Company Details" showBack />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Company Overview Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <View style={styles.iconBox}>
                <Ionicons name="business" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Company Overview</Text>
                <Text style={styles.sectionSubtitle}>Platform Organization Record</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => setEditModalVisible(true)}
            >
              <Ionicons name="pencil" size={14} color={Colors.primary} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Company Name</Text>
            <Text style={styles.fieldValueBold}>{company.name}</Text>
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Platform Status</Text>
            <View style={[styles.statusBadge, isCompanyActive ? styles.statusActive : styles.statusInactive]}>
              <Text style={[styles.statusText, isCompanyActive ? styles.statusTextActive : styles.statusTextInactive]}>
                {company.status || 'Active'}
              </Text>
            </View>
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Created Date</Text>
            <Text style={styles.fieldValue}>
              {company.created_at ? new Date(company.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'}
            </Text>
          </View>
        </View>

        {/* Founder Account Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <View style={[styles.iconBox, { backgroundColor: Colors.infoLight }]}>
                <Ionicons name="person" size={20} color={Colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Founder Account</Text>
                <Text style={styles.sectionSubtitle}>Primary Organization Administrator</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {founder ? (
            <>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Full Name</Text>
                <Text style={styles.fieldValueBold}>{founder.full_name || founder.name || 'N/A'}</Text>
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Email Address</Text>
                <Text style={styles.fieldValue}>{founder.email}</Text>
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Phone Number</Text>
                <Text style={styles.fieldValue}>{founder.phone_number || 'Not provided'}</Text>
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Account State</Text>
                <View style={[styles.statusBadge, isFounderActive ? styles.statusActive : styles.statusInactive]}>
                  <Text style={[styles.statusText, isFounderActive ? styles.statusTextActive : styles.statusTextInactive]}>
                    {isFounderActive ? 'Active' : 'Inactive'}
                  </Text>
                </View>
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Account Registered</Text>
                <Text style={styles.fieldValue}>
                  {founder.created_at ? new Date(founder.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                </Text>
              </View>

              {/* Founder Management Action */}
              <TouchableOpacity
                style={[styles.founderActionBtn, isFounderActive ? styles.deactivateFounderBtn : styles.activateFounderBtn]}
                onPress={handleToggleFounderStatus}
                disabled={updating}
              >
                <Ionicons
                  name={isFounderActive ? 'pause-circle-outline' : 'play-circle-outline'}
                  size={16}
                  color={isFounderActive ? Colors.danger : Colors.success}
                />
                <Text style={[styles.founderActionText, isFounderActive ? styles.deactivateFounderText : styles.activateFounderText]}>
                  {isFounderActive ? 'Deactivate Founder Account' : 'Activate Founder Account'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.noFounderBox}>
              <Ionicons name="alert-circle-outline" size={24} color={Colors.warning} />
              <Text style={styles.noFounderText}>No Founder account currently linked to this company.</Text>
            </View>
          )}
        </View>

        {/* Administrative Company Management Actions */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Lifecycle Actions</Text>
          <Text style={styles.sectionSubtitle}>Manage platform operational status for this tenant</Text>

          <View style={styles.divider} />

          <TouchableOpacity
            style={[styles.lifecycleBtn, isCompanyActive ? styles.deactivateCompanyBtn : styles.activateCompanyBtn]}
            onPress={handleToggleCompanyStatus}
            disabled={updating}
          >
            <Ionicons
              name={isCompanyActive ? 'close-circle' : 'checkmark-circle'}
              size={18}
              color={isCompanyActive ? Colors.danger : Colors.success}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.lifecycleTitle, isCompanyActive ? styles.deactivateCompanyText : styles.activateCompanyText]}>
                {isCompanyActive ? 'Deactivate Company' : 'Activate Company'}
              </Text>
              <Text style={styles.lifecycleDesc}>
                {isCompanyActive
                  ? 'Temporarily disable company tenant operations while preserving all historical data.'
                  : 'Restore active tenant operations and allow normal organizational logins.'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Danger Zone: Permanent Deletion */}
        <View style={[styles.card, styles.dangerCard]}>
          <Text style={[styles.sectionTitle, { color: Colors.danger }]}>Danger Zone</Text>
          <Text style={styles.sectionSubtitle}>Irreversible platform administrative actions</Text>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.deleteCompanyBtn}
            onPress={handleDeleteCompany}
            disabled={updating}
          >
            <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
            <Text style={styles.deleteCompanyBtnText}>Delete Company & Revoke User Access</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit Company Name Modal */}
      <Modal
        visible={editModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Company Name</Text>
            <TextInput
              style={styles.modalInput}
              value={newCompanyName}
              onChangeText={setNewCompanyName}
              placeholder="Company Name"
              placeholderTextColor={Colors.textMuted}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditModalVisible(false)}
                disabled={updating}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveCompanyName}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Layout.spacing.lg,
    gap: Layout.spacing.lg,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.md,
    color: Colors.danger,
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
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.sm,
    flex: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: Layout.radius.md,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  sectionSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Layout.radius.sm,
    backgroundColor: Colors.primaryLight,
  },
  editBtnText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  fieldLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  fieldValue: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  fieldValueBold: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: Layout.spacing.sm,
    paddingVertical: 3,
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
  founderActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    marginTop: Layout.spacing.xs,
  },
  activateFounderBtn: {
    borderColor: Colors.success,
    backgroundColor: Colors.successLight,
  },
  deactivateFounderBtn: {
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerLight,
  },
  founderActionText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
  },
  activateFounderText: {
    color: Colors.successText,
  },
  deactivateFounderText: {
    color: Colors.dangerText,
  },
  noFounderBox: {
    alignItems: 'center',
    paddingVertical: Layout.spacing.md,
    gap: 4,
  },
  noFounderText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  lifecycleBtn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Layout.spacing.md,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    gap: Layout.spacing.md,
  },
  activateCompanyBtn: {
    borderColor: Colors.success,
    backgroundColor: Colors.successLight,
  },
  deactivateCompanyBtn: {
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerLight,
  },
  lifecycleTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
  },
  activateCompanyText: {
    color: Colors.successText,
  },
  deactivateCompanyText: {
    color: Colors.dangerText,
  },
  lifecycleDesc: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Layout.spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    padding: Layout.spacing.lg,
    gap: Layout.spacing.md,
    ...Layout.shadow.modal,
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    borderRadius: Layout.radius.md,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: 8,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    backgroundColor: Colors.surfaceSubtle,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Layout.spacing.sm,
    marginTop: Layout.spacing.xs,
  },
  modalCancelBtn: {
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: 8,
  },
  modalCancelText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  modalSaveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: 8,
    borderRadius: Layout.radius.md,
  },
  modalSaveText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: '#FFFFFF',
  },
  dangerCard: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.03)',
  },
  deleteCompanyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.danger,
    paddingVertical: 12,
    borderRadius: Layout.radius.md,
    gap: 8,
  },
  deleteCompanyBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: '#FFFFFF',
  },
});
