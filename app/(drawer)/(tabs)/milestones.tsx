import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import { ROIWidget } from '../../../src/components/ROIWidget';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';

export default function MilestonesHubScreen() {
  const { profile } = useAuth();
  const isFounder = profile?.role === 'Founder';
  
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isFounder);

  useEffect(() => {
    if (isFounder) {
      fetchDepartments();
    }
  }, [isFounder]);

  const fetchDepartments = async () => {
    setLoading(true);
    const { data } = await supabase.from('departments').select('id, name').order('name');
    if (data && data.length > 0) {
      setDepartments(data);
      setSelectedDeptId(data[0].id);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="trophy" size={24} color={Colors.primary} />
        <Text style={styles.headerTitle}>Milestones</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {isFounder && departments.length > 0 && (
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Select Department</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deptList}>
                {departments.map(dept => (
                  <TouchableOpacity 
                    key={dept.id} 
                    style={[styles.deptChip, selectedDeptId === dept.id && styles.deptChipSelected]}
                    onPress={() => setSelectedDeptId(dept.id)}
                  >
                    <Text style={[styles.deptChipText, selectedDeptId === dept.id && styles.deptChipTextSelected]}>
                      {dept.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {(!isFounder || selectedDeptId) && (
            <ROIWidget overrideDepartmentId={isFounder ? (selectedDeptId || undefined) : undefined} />
          )}

          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color={Colors.primary} style={{marginRight: 10}} />
            <Text style={styles.infoText}>
              Milestones track department performance against set targets. Complete tasks to drive these metrics automatically.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Layout.spacing.lg,
    paddingTop: Layout.spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  headerTitle: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginLeft: Layout.spacing.sm,
  },
  scrollContent: {
    paddingBottom: 40,
    paddingTop: Layout.spacing.md,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    paddingHorizontal: Layout.spacing.lg,
    marginBottom: Layout.spacing.md,
  },
  pickerLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: Layout.spacing.sm,
    letterSpacing: Typography.letterSpacing.wide,
  },
  deptList: {
    flexDirection: 'row',
  },
  deptChip: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.sm,
    borderRadius: Layout.radius.full,
    marginRight: Layout.spacing.sm,
  },
  deptChipSelected: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  deptChipText: {
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
  },
  deptChipTextSelected: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.semiBold,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: Colors.primaryLight,
    padding: Layout.spacing.lg,
    marginHorizontal: Layout.spacing.lg,
    marginTop: Layout.spacing.section,
    borderRadius: Layout.radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  infoText: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    lineHeight: Typography.lineHeight.base,
  },
});
