import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';

export default function CurrentUsersScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  useEffect(() => {
    if (profile?.role !== 'Founder') {
      router.replace('/');
      return;
    }

    async function fetchData() {
      setLoading(true);
      
      const { data: depts } = await supabase.from('departments').select('id, name');
      const { data: usrs } = await supabase.from('users').select('*').eq('is_approved', true).order('full_name');
      
      if (depts) setDepartments(depts);
      if (usrs) setUsers(usrs);
      
      setLoading(false);
    }
    
    fetchData();
  }, [profile]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.semanticYellow} />
      </View>
    );
  }

  const grouped: Record<string, any[]> = {};
  departments.forEach(d => {
    grouped[d.name] = [];
  });
  grouped['Unassigned'] = [];

  users.forEach(u => {
    if (u.role === 'Founder') return;
    
    if (u.department_id) {
      const dept = departments.find(d => d.id === u.department_id);
      if (dept) {
        grouped[dept.name].push({ ...u, departmentName: dept.name });
      } else {
        grouped['Unassigned'].push({ ...u, departmentName: 'Unassigned' });
      }
    } else {
      grouped['Unassigned'].push({ ...u, departmentName: 'Unassigned' });
    }
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ZeroTaskHeader />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Current Users</Text>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.subtitle}>Team Directory</Text>
        
        {Object.entries(grouped).map(([deptName, deptUsers]) => {
          if (deptUsers.length === 0) return null;
          
          return (
            <View key={deptName} style={styles.departmentSection}>
              <Text style={styles.departmentName}>{deptName}</Text>
              <View style={styles.card}>
                {deptUsers.map((u, idx) => (
                  <TouchableOpacity 
                    key={u.id} 
                    style={[
                      styles.userRow, 
                      idx === deptUsers.length - 1 && { borderBottomWidth: 0 }
                    ]}
                    onPress={() => setSelectedUser(u)}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{u.full_name?.substring(0, 1).toUpperCase() || '?'}</Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{u.full_name || 'Unnamed'}</Text>
                      <Text style={styles.userRole}>{u.role}</Text>
                    </View>
                    <View style={styles.userStatus}>
                      <View style={styles.statusDot} />
                      <Text style={styles.statusText}>Active</Text>
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ marginLeft: 8 }} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Profile Modal */}
      <Modal visible={!!selectedUser} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedUser(null)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>User Profile</Text>
            <TouchableOpacity onPress={() => setSelectedUser(null)}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
          {selectedUser && (
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.profileHeader}>
                <View style={styles.largeAvatar}>
                  <Text style={styles.largeAvatarText}>{selectedUser.full_name?.substring(0, 1).toUpperCase() || '?'}</Text>
                </View>
                <Text style={styles.profileName}>{selectedUser.full_name || 'Unnamed'}</Text>
                <Text style={styles.profileRole}>{selectedUser.role}</Text>
              </View>

              <View style={styles.detailCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Email</Text>
                  <Text style={styles.detailValue}>{selectedUser.email}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Department</Text>
                  <Text style={styles.detailValue}>{selectedUser.departmentName}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={[styles.statusBadge, { backgroundColor: selectedUser.is_approved ? Colors.semanticSage : Colors.semanticYellow }]}>
                    <Text style={[styles.statusBadgeText, { color: selectedUser.is_approved ? Colors.textInverse : Colors.textPrimary }]}>
                      {selectedUser.is_approved ? 'Approved' : 'Pending'}
                    </Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Account Created</Text>
                  <Text style={styles.detailValue}>
                    {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString() : 'Unknown'}
                  </Text>
                </View>
              </View>
            </ScrollView>
          )}
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
  center: {
    flex: 1,
    backgroundColor: Colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Layout.spacing.lg,
    backgroundColor: Colors.canvas,
  },
  backButton: {
    marginRight: Layout.spacing.md,
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  content: {
    flex: 1,
    padding: Layout.spacing.lg,
  },
  subtitle: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textSecondary,
    marginBottom: Layout.spacing.lg,
  },
  departmentSection: {
    marginBottom: Layout.spacing.xl,
  },
  departmentName: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Layout.spacing.sm,
  },
  card: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: 'hidden',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Layout.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Layout.spacing.md,
  },
  avatarText: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  userRole: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  userStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.semanticSage,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.semanticSage,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingTop: 48, // approx safe area
    backgroundColor: Colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  doneText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
  },
  modalContent: {
    padding: Layout.spacing.xl,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: Layout.spacing.xxl,
  },
  largeAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Layout.spacing.md,
  },
  largeAvatarText: {
    fontSize: 32,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  profileName: {
    fontSize: Typography.fontSize.xxl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  profileRole: {
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
  },
  detailCard: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Layout.spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Layout.spacing.xs,
  },
  detailLabel: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
  },
  detailValue: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.semiBold,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginVertical: Layout.spacing.md,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
  }
});
