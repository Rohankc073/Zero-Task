import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { SuperAdminService } from '../../../src/services/admin/SuperAdminService';
import { Avatar } from '../../../src/components/ui/Avatar';

export default function FoundersScreen() {
  const router = useRouter();
  const [founders, setFounders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Preview Modal State
  const [selectedFounder, setSelectedFounder] = useState<any | null>(null);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchFounders = async () => {
    try {
      setLoading(true);
      const data = await SuperAdminService.getFounders(searchQuery);
      setFounders(data);
      if (selectedFounder) {
        const updated = data.find((f: any) => f.id === selectedFounder.id);
        if (updated) setSelectedFounder(updated);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to fetch founders');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchFounders();
    }, [])
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchFounders();
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handleToggleFounderStatus = (founder: any) => {
    const isCurrentlyActive = founder.is_active !== false;
    const actionText = isCurrentlyActive ? 'Deactivate' : 'Activate';

    Alert.alert(
      `${actionText} Founder Account`,
      `Are you sure you want to ${actionText.toLowerCase()} the account for "${founder.full_name || founder.email}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionText,
          style: isCurrentlyActive ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setUpdatingStatus(true);
              await SuperAdminService.updateFounderActiveState(founder.id, !isCurrentlyActive);
              await fetchFounders();
              Alert.alert('Success', `Founder account has been ${actionText.toLowerCase()}d.`);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to update founder account');
            } finally {
              setUpdatingStatus(false);
            }
          },
        },
      ]
    );
  };

  const renderFounderCard = ({ item }: { item: any }) => {
    const isActive = item.is_active !== false;
    const companyName = item.company?.name || 'Unassigned Company';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => {
          setSelectedFounder(item);
          setPreviewModalVisible(true);
        }}
      >
        <View style={styles.cardHeader}>
          <Avatar
            name={item.full_name || item.name || item.email}
            uri={item.avatar_url}
            size={44}
          />
          <View style={styles.infoCol}>
            <Text style={styles.founderName}>{item.full_name || item.name || 'Founder'}</Text>
            <Text style={styles.founderEmail}>{item.email}</Text>
            {item.phone_number && (
              <Text style={styles.founderPhone}>{item.phone_number}</Text>
            )}
          </View>

          <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
            <Text style={[styles.statusText, isActive ? styles.statusTextActive : styles.statusTextInactive]}>
              {isActive ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={styles.companyBadge}
            onPress={(e) => {
              e.stopPropagation();
              if (item.company?.id) {
                router.push(`/(drawer)/(superadmin)/company/${item.company.id}` as any);
              }
            }}
          >
            <Ionicons name="business-outline" size={13} color={Colors.primary} />
            <Text style={styles.companyBadgeText}>{companyName}</Text>
          </TouchableOpacity>

          <View style={styles.footerActions}>
            <TouchableOpacity
              style={[styles.actionBtn, isActive ? styles.deactivateBtn : styles.activateBtn]}
              onPress={(e) => {
                e.stopPropagation();
                handleToggleFounderStatus(item);
              }}
            >
              <Text style={[styles.actionBtnText, isActive ? styles.deactivateBtnText : styles.activateBtnText]}>
                {isActive ? 'Deactivate' : 'Activate'}
              </Text>
            </TouchableOpacity>

            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const isSelectedActive = selectedFounder ? selectedFounder.is_active !== false : false;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ZeroTask App Header with Drawer Toggle & Logo */}
      <ZeroTaskHeader />

      {/* Page Title & Search Header */}
      <View style={styles.searchSection}>
        <Text style={styles.pageTitle}>Founders</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search founders by name, email, or company..."
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

      {/* Founders List */}
      <FlatList
        data={founders}
        renderItem={renderFounderCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchFounders}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No founders found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? 'No founders matched your search query.'
                  : 'Founder accounts will appear here once new companies are initialized.'}
              </Text>
            </View>
          ) : (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          )
        }
      />

      {/* ── Founder Details Preview Modal ── */}
      <Modal
        visible={previewModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {selectedFounder && (
              <>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderTitleRow}>
                    <View style={styles.modalHeaderIcon}>
                      <Ionicons name="person" size={18} color={Colors.primary} />
                    </View>
                    <View>
                      <Text style={styles.modalTitle}>Founder Details</Text>
                      <Text style={styles.modalSubtitle}>Organization Account Information</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPreviewModalVisible(false)}
                    style={styles.modalCloseBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={22} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Modal Scrollable Content */}
                <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                  {/* Profile Header Box */}
                  <View style={styles.previewProfileBox}>
                    <Avatar
                      name={selectedFounder.full_name || selectedFounder.name || selectedFounder.email}
                      uri={selectedFounder.avatar_url}
                      size={60}
                    />
                    <Text style={styles.previewName}>
                      {selectedFounder.full_name || selectedFounder.name || 'Founder'}
                    </Text>
                    <Text style={styles.previewEmail}>{selectedFounder.email}</Text>

                    <View style={styles.previewBadgesRow}>
                      <View style={styles.roleBadge}>
                        <Ionicons name="shield-checkmark-outline" size={12} color={Colors.primary} />
                        <Text style={styles.roleBadgeText}>Founder Account</Text>
                      </View>

                      <View style={[styles.statusBadge, isSelectedActive ? styles.statusActive : styles.statusInactive]}>
                        <Text style={[styles.statusText, isSelectedActive ? styles.statusTextActive : styles.statusTextInactive]}>
                          {isSelectedActive ? 'Active' : 'Inactive'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Section 1: Contact & Account Details */}
                  <View style={styles.previewSection}>
                    <Text style={styles.sectionHeading}>ACCOUNT DETAILS</Text>

                    <View style={styles.detailRow}>
                      <View style={styles.detailIconBox}>
                        <Ionicons name="mail-outline" size={16} color={Colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailLabel}>Email Address</Text>
                        <Text style={styles.detailValue}>{selectedFounder.email}</Text>
                      </View>
                    </View>

                    <View style={styles.detailRow}>
                      <View style={styles.detailIconBox}>
                        <Ionicons name="call-outline" size={16} color={Colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailLabel}>Phone Number</Text>
                        <Text style={styles.detailValue}>{selectedFounder.phone_number || 'Not provided'}</Text>
                      </View>
                    </View>

                    <View style={styles.detailRow}>
                      <View style={styles.detailIconBox}>
                        <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailLabel}>Registration Date</Text>
                        <Text style={styles.detailValue}>
                          {selectedFounder.created_at
                            ? new Date(selectedFounder.created_at).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })
                            : 'N/A'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Section 2: Associated Company */}
                  <View style={styles.previewSection}>
                    <Text style={styles.sectionHeading}>ASSOCIATED COMPANY</Text>

                    <View style={styles.companyCard}>
                      <View style={styles.companyCardHeader}>
                        <View style={styles.companyIconBox}>
                          <Ionicons name="business" size={18} color={Colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.companyTitle}>
                            {selectedFounder.company?.name || 'Unassigned Company'}
                          </Text>
                          <Text style={styles.companyStatusText}>
                            Status: {selectedFounder.company?.status || 'Active'}
                          </Text>
                        </View>
                      </View>

                      {selectedFounder.company?.id && (
                        <TouchableOpacity
                          style={styles.viewCompanyBtn}
                          onPress={() => {
                            setPreviewModalVisible(false);
                            router.push(`/(drawer)/(superadmin)/company/${selectedFounder.company.id}` as any);
                          }}
                        >
                          <Ionicons name="open-outline" size={14} color={Colors.primary} />
                          <Text style={styles.viewCompanyBtnText}>Open Company Details</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Section 3: Status Toggle Action */}
                  <View style={styles.actionSection}>
                    <TouchableOpacity
                      style={[
                        styles.toggleStatusBtn,
                        isSelectedActive ? styles.deactivateLargeBtn : styles.activateLargeBtn,
                      ]}
                      onPress={() => handleToggleFounderStatus(selectedFounder)}
                      disabled={updatingStatus}
                    >
                      {updatingStatus ? (
                        <ActivityIndicator size="small" color={isSelectedActive ? Colors.danger : Colors.success} />
                      ) : (
                        <>
                          <Ionicons
                            name={isSelectedActive ? 'pause-circle-outline' : 'play-circle-outline'}
                            size={18}
                            color={isSelectedActive ? Colors.danger : Colors.success}
                          />
                          <Text
                            style={[
                              styles.toggleStatusBtnText,
                              isSelectedActive ? styles.deactivateLargeBtnText : styles.activateLargeBtnText,
                            ]}
                          >
                            {isSelectedActive ? 'Deactivate Founder Account' : 'Activate Founder Account'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </ScrollView>

                {/* Modal Footer */}
                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.doneBtn}
                    onPress={() => setPreviewModalVisible(false)}
                  >
                    <Text style={styles.doneBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
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
    backgroundColor: Colors.background,
  },
  searchSection: {
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: Layout.spacing.sm,
    paddingBottom: Layout.spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDefault,
    gap: Layout.spacing.sm,
  },
  pageTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xl,
    color: Colors.textPrimary,
  },
  searchBar: {
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
    alignItems: 'center',
    gap: Layout.spacing.md,
  },
  infoCol: {
    flex: 1,
    gap: 2,
  },
  founderName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  founderEmail: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  founderPhone: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 11,
    color: Colors.textMuted,
  },
  statusBadge: {
    paddingHorizontal: Layout.spacing.sm,
    paddingVertical: 4,
    borderRadius: Layout.radius.full,
    alignSelf: 'flex-start',
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
  companyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Layout.spacing.sm,
    paddingVertical: 4,
    borderRadius: Layout.radius.sm,
    gap: 4,
  },
  companyBadgeText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.xs,
  },
  actionBtn: {
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: 5,
    borderRadius: Layout.radius.sm,
  },
  activateBtn: {
    backgroundColor: Colors.successLight,
  },
  deactivateBtn: {
    backgroundColor: Colors.dangerLight,
  },
  actionBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
  },
  activateBtnText: {
    color: Colors.successText,
  },
  deactivateBtnText: {
    color: Colors.dangerText,
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

  /* ── Preview Modal Styles ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.spacing.lg,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.xl,
    overflow: 'hidden',
    ...Layout.shadow.modal,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: Layout.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDefault,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.sm,
  },
  modalHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: Layout.radius.sm,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalContent: {
    padding: Layout.spacing.lg,
    gap: Layout.spacing.lg,
  },
  previewProfileBox: {
    alignItems: 'center',
    paddingVertical: Layout.spacing.md,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: Layout.radius.lg,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
  },
  previewName: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
    marginTop: 4,
  },
  previewEmail: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  previewBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.sm,
    marginTop: 4,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Layout.radius.full,
    gap: 4,
  },
  roleBadgeText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 10,
    color: Colors.primary,
  },
  previewSection: {
    gap: Layout.spacing.sm,
  },
  sectionHeading: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 0.8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  detailIconBox: {
    width: 32,
    height: 32,
    borderRadius: Layout.radius.sm,
    backgroundColor: Colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
  },
  detailValue: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    marginTop: 1,
  },
  companyCard: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: Layout.radius.md,
    padding: Layout.spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    gap: Layout.spacing.sm,
  },
  companyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.sm,
  },
  companyIconBox: {
    width: 32,
    height: 32,
    borderRadius: Layout.radius.sm,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  companyStatusText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  viewCompanyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    paddingVertical: 8,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
  },
  viewCompanyBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
  },
  actionSection: {
    paddingTop: Layout.spacing.xs,
  },
  toggleStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
  },
  activateLargeBtn: {
    backgroundColor: Colors.successLight,
    borderColor: Colors.success,
  },
  deactivateLargeBtn: {
    backgroundColor: Colors.dangerLight,
    borderColor: Colors.danger,
  },
  toggleStatusBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
  },
  activateLargeBtnText: {
    color: Colors.successText,
  },
  deactivateLargeBtnText: {
    color: Colors.dangerText,
  },
  modalFooter: {
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: Layout.spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderDefault,
    backgroundColor: Colors.surface,
  },
  doneBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: Layout.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: '#FFFFFF',
  },
});
