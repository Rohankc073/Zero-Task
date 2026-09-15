import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Colors, Typography, Layout } from '../theme/tokens';
import { ZeroTaskHeader } from './ZeroTaskHeader';
import { Company } from '../types';

interface MultiCompanyFilterSelectorProps {
  selectedCompanyIds: string[];
  onSelectCompanies: (companyIds: string[], companies: Company[]) => void;
  showAllOption?: boolean;
  allOptionLabel?: string;
  label?: string;
  placeholder?: string;
  style?: any;
}

export function MultiCompanyFilterSelector({
  selectedCompanyIds,
  onSelectCompanies,
  showAllOption = true,
  allOptionLabel = 'All Companies',
  label,
  placeholder = 'Select Company',
  style,
}: MultiCompanyFilterSelectorProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Local state for the modal so we can apply changes at once
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>([]);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching companies for selector:', error);
      } else if (data) {
        const activeCompanies = (data as Company[]).filter(
          (c) => c.status === 'Active' || !c.status
        );
        setCompanies(activeCompanies);
      }
    } catch (err: any) {
      console.error('Error fetching companies for selector:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleOpenModal = () => {
    fetchCompanies();
    setSearchQuery('');
    setLocalSelectedIds(selectedCompanyIds);
    setModalVisible(true);
  };

  const handleApply = () => {
    const selectedComps = companies.filter(c => localSelectedIds.includes(c.id));
    onSelectCompanies(localSelectedIds, selectedComps);
    setModalVisible(false);
  };

  const displayLabel = selectedCompanyIds.length === 0
    ? allOptionLabel
    : (selectedCompanyIds.length === 1 
        ? (companies.find((c) => c.id === selectedCompanyIds[0])?.name || placeholder) 
        : `${selectedCompanyIds.length} Companies Selected`);

  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0);

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.fieldLabel}>{label}</Text>}
      
      <TouchableOpacity
        style={styles.selectorBtn}
        onPress={handleOpenModal}
        activeOpacity={0.8}
      >
        <Ionicons name="business-outline" size={16} color={Colors.primary} style={styles.icon} />
        <Text style={styles.selectorText} numberOfLines={1}>
          {displayLabel}
        </Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textMuted} style={styles.chevron} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: safeTop }]}>
          {/* ZeroTask App Header */}
          <ZeroTaskHeader showClose onClose={() => setModalVisible(false)} showDrawer={false} />

          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <Ionicons name="business" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>Select Companies</Text>
            </View>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search companies..."
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* List */}
          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredCompanies}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                showAllOption && !searchQuery ? (
                  <TouchableOpacity
                    style={[
                      styles.companyItem,
                      localSelectedIds.length === 0 && styles.companyItemActive,
                    ]}
                    onPress={() => setLocalSelectedIds([])}
                  >
                    <View style={styles.companyIconBox}>
                      <Ionicons
                        name="globe-outline"
                        size={18}
                        color={localSelectedIds.length === 0 ? Colors.primary : Colors.textSecondary}
                      />
                    </View>
                    <View style={styles.companyInfo}>
                      <Text
                        style={[
                          styles.companyName,
                          localSelectedIds.length === 0 && styles.companyNameActive,
                        ]}
                      >
                        {allOptionLabel}
                      </Text>
                      <Text style={styles.companyMeta}>All registered company workspaces</Text>
                    </View>
                    {localSelectedIds.length === 0 ? (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={20} color={Colors.textMuted} />
                    )}
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="business-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyTitle}>No Companies Found</Text>
                  <Text style={styles.emptySubtitle}>
                    {searchQuery.trim()
                      ? `No companies match "${searchQuery}".`
                      : 'No registered company workspaces are available.'}
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const isSelected = localSelectedIds.includes(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.companyItem, isSelected && styles.companyItemActive]}
                    onPress={() => {
                      if (isSelected) {
                        setLocalSelectedIds(prev => prev.filter(id => id !== item.id));
                      } else {
                        setLocalSelectedIds(prev => [...prev, item.id]);
                      }
                    }}
                  >
                    <View style={styles.companyIconBox}>
                      <Ionicons
                        name="business-outline"
                        size={18}
                        color={isSelected ? Colors.primary : Colors.textSecondary}
                      />
                    </View>
                    <View style={styles.companyInfo}>
                      <Text style={[styles.companyName, isSelected && styles.companyNameActive]}>
                        {item.name}
                      </Text>
                      {(item as any).industry || item.code ? (
                        <Text style={styles.companyMeta}>{(item as any).industry || item.code}</Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={20} color={Colors.textMuted} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* Footer Action */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
              <Text style={styles.applyBtnText}>
                {localSelectedIds.length > 0 ? `Apply (${localSelectedIds.length})` : 'Apply (All Companies)'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  fieldLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  icon: {
    marginRight: 8,
  },
  selectorText: {
    flex: 1,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  chevron: {
    marginLeft: 6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    marginHorizontal: Layout.spacing.lg,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  listContent: {
    paddingHorizontal: Layout.spacing.lg,
    paddingBottom: 24,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  companyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: Layout.radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  companyItemActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceRaised,
  },
  companyIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  companyInfo: {
    flex: 1,
  },
  companyName: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  companyNameActive: {
    color: Colors.primary,
  },
  companyMeta: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: Layout.spacing.xl,
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  footer: {
    padding: Layout.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  applyBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: Layout.radius.md,
    alignItems: 'center',
  },
  applyBtnText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
  },
});
