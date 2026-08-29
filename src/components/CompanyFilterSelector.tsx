import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Colors, Typography, Layout } from '../theme/tokens';
import { Company } from '../types';

interface CompanyFilterSelectorProps {
  selectedCompanyId: string | null;
  onSelectCompany: (companyId: string | null, company?: Company | null) => void;
  showAllOption?: boolean;
  allOptionLabel?: string;
  label?: string;
  placeholder?: string;
  style?: any;
}

export function CompanyFilterSelector({
  selectedCompanyId,
  onSelectCompany,
  showAllOption = true,
  allOptionLabel = 'All Companies',
  label,
  placeholder = 'Select Company',
  style,
}: CompanyFilterSelectorProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let isMounted = true;
    const fetchCompanies = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (!error && data && isMounted) {
          setCompanies(data as Company[]);
        }
      } catch (err) {
        console.error('Error fetching companies for selector:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchCompanies();
    return () => {
      isMounted = false;
    };
  }, []);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);
  const displayLabel = selectedCompanyId === null || selectedCompanyId === 'all'
    ? allOptionLabel
    : selectedCompany?.name || placeholder;

  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.fieldLabel}>{label}</Text>}
      
      <TouchableOpacity
        style={styles.selectorBtn}
        onPress={() => setModalVisible(true)}
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
        <View style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <Ionicons name="business" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>Select Company</Text>
            </View>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textPrimary} />
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
                      (selectedCompanyId === null || selectedCompanyId === 'all') && styles.companyItemActive,
                    ]}
                    onPress={() => {
                      onSelectCompany(null, null);
                      setModalVisible(false);
                    }}
                  >
                    <View style={styles.companyIconBox}>
                      <Ionicons
                        name="globe-outline"
                        size={18}
                        color={selectedCompanyId === null ? Colors.primary : Colors.textSecondary}
                      />
                    </View>
                    <View style={styles.companyInfo}>
                      <Text
                        style={[
                          styles.companyName,
                          (selectedCompanyId === null || selectedCompanyId === 'all') && styles.companyNameActive,
                        ]}
                      >
                        {allOptionLabel}
                      </Text>
                      <Text style={styles.companyMeta}>All registered company workspaces</Text>
                    </View>
                    {(selectedCompanyId === null || selectedCompanyId === 'all') && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                ) : null
              }
              renderItem={({ item }) => {
                const isSelected = selectedCompanyId === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.companyItem, isSelected && styles.companyItemActive]}
                    onPress={() => {
                      onSelectCompany(item.id, item);
                      setModalVisible(false);
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
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
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
});
