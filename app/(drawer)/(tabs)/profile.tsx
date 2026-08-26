import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import { useRouter } from 'expo-router';
import { useInAppNotifications } from '../../../src/hooks/useInAppNotifications';
import { User } from '../../../src/types';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { Avatar } from '../../../src/components/ui/Avatar';


// ── Setting Row ───────────────────────────────────────────────────
function SettingRow({
  icon,
  label,
  iconBg,
  iconColor,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  iconBg: string;
  iconColor: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.settingIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={[styles.settingLabel, destructive && { color: Colors.danger }]}>
        {label}
      </Text>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={destructive ? Colors.danger : Colors.textMuted}
      />
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────
export default function ProfileScreen() {
  const { session, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { notifications, unreadCount } = useInAppNotifications();

  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showRemoveUser, setShowRemoveUser] = useState(false);
  const [removeUserEmail, setRemoveUserEmail] = useState('');
  const [isRemovingUser, setIsRemovingUser] = useState(false);
  
  const [pendingPhoneRequest, setPendingPhoneRequest] = useState<string | null>(null);
  const [showChangePhone, setShowChangePhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');

  const handleSaveProfile = async () => {
    if (!editName.trim()) { Alert.alert('Error', 'Name cannot be empty.'); return; }
    try {
      setIsSaving(true);
      const { data, error } = await supabase.from('users').update({ full_name: editName.trim() }).eq('id', session?.user?.id).select().single();
      if (error) throw error;
      if (!data) throw new Error('Failed to update profile. Please check your permissions.');
      setProfile(prev => prev ? { ...prev, full_name: editName.trim() } : null);
      await refreshProfile();
      setShowEditProfile(false);
      Alert.alert('Success', 'Profile updated successfully.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword) { Alert.alert('Error', 'Please enter your current password.'); return; }
    if (newPassword.length < 6) { Alert.alert('Error', 'New password must be at least 6 characters.'); return; }
    try {
      setIsSaving(true);
      // Verify old password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: session?.user?.email as string,
        password: oldPassword,
      });
      if (signInError) throw new Error('Incorrect current password.');

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setShowChangePassword(false);
      setOldPassword('');
      setNewPassword('');
      Alert.alert('Success', 'Password updated successfully.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update password.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleForgotPassword = async () => {
    try {
      setIsSaving(true);
      const { data, error } = await supabase.rpc('request_password_reset', { p_email: session?.user?.email });
      if (error) throw error;
      Alert.alert('Password Reset Requested', data?.message || 'Your request has been sent for approval.');
      setShowChangePassword(false);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to request password reset.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveUser = async () => {
    if (!removeUserEmail.trim()) { Alert.alert('Error', 'Please enter an email address.'); return; }
    Alert.alert('Confirm Removal', `Are you sure you want to remove "${removeUserEmail.trim()}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            setIsRemovingUser(true);
            const { error } = await supabase.rpc('remove_user_by_email', { target_email: removeUserEmail.trim().toLowerCase() });
            if (error) throw error;
            Alert.alert('Success', 'User has been removed successfully.');
            setShowRemoveUser(false);
            setRemoveUserEmail('');
          } catch (error: any) {
            Alert.alert('Error removing user', error.message || 'Unknown error occurred.');
          } finally {
            setIsRemovingUser(false);
          }
        }
      },
    ]);
  };

  const handleChangePhone = async () => {
    if (!newPhone) { Alert.alert('Error', 'Please enter a new phone number.'); return; }
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    if (!phoneRegex.test(newPhone.replace(/[\s-]/g, ''))) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid international phone number (e.g. +971 50...).');
      return;
    }
    try {
      setIsSaving(true);
      const { error } = await supabase.rpc('request_phone_change', { p_new_phone: newPhone });
      if (error) throw error;
      Alert.alert('Success', 'Phone number change requested successfully.');
      setShowChangePhone(false);
      setNewPhone('');
      fetchProfile();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to request phone change.');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (session?.user?.id) fetchProfile();
  }, [session?.user?.id]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase.from('users').select('*').eq('id', session!.user.id).single();
      if (error) {
        if (error.code === 'PGRST116') return;
        throw error;
      }
      setProfile(data);

      const { data: reqData } = await supabase
        .from('phone_change_requests')
        .select('new_phone_number')
        .eq('user_id', session!.user.id)
        .eq('status', 'Pending')
        .maybeSingle();
      
      if (reqData) {
        setPendingPhoneRequest(reqData.new_phone_number);
      } else {
        setPendingPhoneRequest(null);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setProfile(null);
    await signOut();
    router.replace('/(auth)/login');
  };

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ZeroTaskHeader />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Profile Header ── */}
        <View style={styles.profileCard}>
          <Avatar
            name={profile?.full_name || profile?.email}
            uri={profile?.avatar_url}
            size={72}
            style={{ marginBottom: Layout.spacing.md }}
          />
          <Text style={styles.name}>{profile?.full_name || profile?.name || 'User'}</Text>
          <Text style={styles.email}>{profile?.email || session?.user?.email}</Text>
          {profile?.role && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{profile.role}</Text>
            </View>
          )}
        </View>

        {/* ── Account & Security ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account & Security</Text>
          <View style={styles.settingsCard}>
            <SettingRow
              icon="person-circle-outline"
              label="Edit Profile Name"
              iconBg={Colors.primaryLight}
              iconColor={Colors.primary}
              onPress={() => { setEditName(profile?.full_name || profile?.name || ''); setShowEditProfile(true); }}
            />
            <View style={styles.divider} />
            <SettingRow
              icon="call-outline"
              label={profile?.phone_number ? `Phone: ${profile.phone_number}` : 'Add Phone Number'}
              iconBg={Colors.warningLight}
              iconColor={Colors.warning}
              onPress={() => { setNewPhone(''); setShowChangePhone(true); }}
            />
            {pendingPhoneRequest && (
              <View style={{ padding: 12, paddingLeft: 64, backgroundColor: Colors.warningLight, borderTopWidth: 1, borderTopColor: Colors.borderSubtle }}>
                <Text style={{ fontSize: 13, color: Colors.warning, fontFamily: Typography.fontFamily.medium }}>
                  Pending Approval: {pendingPhoneRequest}
                </Text>
              </View>
            )}
            <View style={styles.divider} />
            <SettingRow
              icon="lock-closed-outline"
              label="Change Password"
              iconBg={Colors.infoLight}
              iconColor={Colors.info}
              onPress={() => { setOldPassword(''); setNewPassword(''); setShowChangePassword(true); }}
            />
          </View>
        </View>

        {/* ── Admin (Founder only) ── */}
        {profile?.role === 'Founder' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Administration</Text>
            <View style={styles.settingsCard}>
              <SettingRow
                icon="shield-checkmark-outline"
                label="Audit Logs"
                iconBg={Colors.successLight}
                iconColor={Colors.success}
                onPress={() => router.push('/audit-logs' as any)}
              />
              <View style={styles.divider} />
              <SettingRow
                icon="person-remove-outline"
                label="Remove User"
                iconBg={Colors.dangerLight}
                iconColor={Colors.danger}
                onPress={() => { setRemoveUserEmail(''); setShowRemoveUser(true); }}
              />
            </View>
          </View>
        )}

        {/* ── Support ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support & About</Text>
          <View style={styles.settingsCard}>
            <SettingRow
              icon="help-circle-outline"
              label="Help Center"
              iconBg={Colors.warningLight}
              iconColor={Colors.warning}
              onPress={() => router.push('/help-center')}
            />
            <View style={styles.divider} />
            <SettingRow
              icon="document-text-outline"
              label="Privacy Policy"
              iconBg={Colors.surfaceSecondary}
              iconColor={Colors.textSecondary}
              onPress={() => router.push('/privacy-policy')}
            />
          </View>
        </View>



        {/* ── Recent Alerts ── */}
        {notifications.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Alerts</Text>
            <View style={styles.settingsCard}>
              {notifications.slice(0, 3).map((notif, idx) => (
                <View key={notif.id}>
                  {idx > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.notifRow}
                    onPress={() => router.push('/notifications')}
                    activeOpacity={0.7}
                  >
                    {!notif.is_read && (
                      <View style={styles.unreadDot} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notifTitle} numberOfLines={1}>{notif.title}</Text>
                      <Text style={styles.notifMessage} numberOfLines={2}>{notif.message}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Sign Out ── */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={showEditProfile} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditProfile(false)}>
                <Ionicons name="close" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={styles.textInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Enter your name"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveProfile} disabled={isSaving}>
              <Text style={styles.primaryBtnText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Change Password Modal ── */}
      <Modal visible={showChangePassword} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setShowChangePassword(false)}>
                <Ionicons name="close" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Current Password</Text>
            <TextInput
              style={styles.textInput}
              value={oldPassword}
              onChangeText={setOldPassword}
              placeholder="Enter current password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              autoFocus
            />
            <Text style={[styles.inputLabel, { marginTop: 12 }]}>New Password</Text>
            <TextInput
              style={styles.textInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Minimum 6 characters"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleChangePassword} disabled={isSaving}>
              <Text style={styles.primaryBtnText}>{isSaving ? 'Updating...' : 'Update Password'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={{ marginTop: 16, alignItems: 'center' }} 
              onPress={handleForgotPassword}
              disabled={isSaving}
            >
              <Text style={{ color: Colors.primary, fontFamily: Typography.fontFamily.medium, fontSize: 13 }}>
                Forgot your password?
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Change Phone Modal ── */}
      <Modal visible={showChangePhone} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Phone Number</Text>
              <TouchableOpacity onPress={() => setShowChangePhone(false)}>
                <Ionicons name="close" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>New Phone Number</Text>
            <TextInput
              style={styles.textInput}
              value={newPhone}
              onChangeText={setNewPhone}
              placeholder="+971 50 123 4567"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
              autoFocus
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleChangePhone} disabled={isSaving}>
              <Text style={styles.primaryBtnText}>{isSaving ? 'Submitting...' : 'Submit Request'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Remove User Modal ── */}
      <Modal visible={showRemoveUser} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Remove User</Text>
              <TouchableOpacity onPress={() => setShowRemoveUser(false)}>
                <Ionicons name="close" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>User Email</Text>
            <TextInput
              style={styles.textInput}
              value={removeUserEmail}
              onChangeText={setRemoveUserEmail}
              placeholder="Enter email address"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: Colors.danger }]}
              onPress={handleRemoveUser}
              disabled={isRemovingUser}
            >
              <Text style={styles.primaryBtnText}>{isRemovingUser ? 'Removing...' : 'Remove User'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Layout.spacing.lg,
    paddingTop: Layout.spacing.xl,
    gap: Layout.spacing.lg,
  },

  // Profile card
  profileCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Layout.spacing.xl,
    alignItems: 'center',
    ...Layout.shadow.card,
  },
  name: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xl,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  email: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
    marginBottom: Layout.spacing.md,
  },
  roleBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: Layout.spacing.xs,
    borderRadius: Layout.radius.full,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
  },
  roleText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Sections
  section: {},
  sectionTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Layout.spacing.sm,
    paddingHorizontal: 4,
  },
  settingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: 'hidden',
    ...Layout.shadow.card,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Layout.spacing.md,
    paddingHorizontal: Layout.spacing.lg,
    gap: Layout.spacing.md,
  },
  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: Layout.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    flex: 1,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginLeft: Layout.spacing.lg + 34 + Layout.spacing.md,
  },

  // Notifications
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Layout.spacing.md,
    paddingHorizontal: Layout.spacing.lg,
    gap: Layout.spacing.sm,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  notifTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  notifMessage: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },

  // Sign Out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Layout.spacing.sm,
    backgroundColor: Colors.dangerLight,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
    paddingVertical: Layout.spacing.md,
  },
  signOutText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.md,
    color: Colors.danger,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: Layout.spacing.xl,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.xl,
    padding: Layout.spacing.xl,
    ...Layout.shadow.modal,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Layout.spacing.xl,
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xl,
    color: Colors.textPrimary,
  },
  inputLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Layout.spacing.sm,
  },
  textInput: {
    backgroundColor: Colors.background,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: Layout.spacing.md,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
    marginBottom: Layout.spacing.xl,
    height: 48,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Layout.radius.md,
    paddingVertical: Layout.spacing.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.md,
    color: Colors.textInverse,
  },
});
