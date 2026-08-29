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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import { useRouter } from 'expo-router';
import { User } from '../../../src/types';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Layout } from '../../../src/theme/tokens';
import { ZeroTaskHeader } from '../../../src/components/ZeroTaskHeader';
import { Avatar } from '../../../src/components/ui/Avatar';

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

export default function SuperAdminProfileScreen() {
  const { session, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit Name State
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState('');
  
  // Change Phone State (Direct without approval)
  const [showChangePhone, setShowChangePhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');

  // Change Password State
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (session?.user?.id) fetchProfile();
  }, [session?.user?.id]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session!.user.id)
        .single();
      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  // 1. Direct Name Update (No approval needed)
  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    try {
      setIsSaving(true);
      const { data, error } = await supabase
        .from('users')
        .update({ full_name: editName.trim() })
        .eq('id', session?.user?.id)
        .select()
        .single();
      if (error) throw error;
      setProfile(data);
      await refreshProfile();
      setShowEditProfile(false);
      Alert.alert('Success', 'Profile name updated successfully.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile name.');
    } finally {
      setIsSaving(false);
    }
  };

  // 2. Direct Phone Number Update (No approval needed)
  const handleChangePhone = async () => {
    if (!newPhone.trim()) {
      Alert.alert('Error', 'Please enter a phone number.');
      return;
    }
    try {
      setIsSaving(true);
      const { data, error } = await supabase
        .from('users')
        .update({ phone_number: newPhone.trim() })
        .eq('id', session?.user?.id)
        .select()
        .single();
      if (error) throw error;
      setProfile(data);
      await refreshProfile();
      setShowChangePhone(false);
      setNewPhone('');
      Alert.alert('Success', 'Phone number updated successfully.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update phone number.');
    } finally {
      setIsSaving(false);
    }
  };

  // 3. Change Password
  const handleChangePassword = async () => {
    if (!oldPassword) {
      Alert.alert('Error', 'Please enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters.');
      return;
    }
    try {
      setIsSaving(true);
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

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of ZeroTask Platform Administration?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setProfile(null);
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
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
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <Avatar
            name={profile?.full_name || profile?.email}
            uri={profile?.avatar_url}
            size={72}
            style={{ marginBottom: Layout.spacing.md }}
          />
          <Text style={styles.name}>{profile?.full_name || profile?.name || 'Super Admin'}</Text>
          <Text style={styles.email}>{profile?.email || session?.user?.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>SUPER ADMIN</Text>
          </View>
        </View>

        {/* Account & Security */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account & Security</Text>
          <View style={styles.settingsCard}>
            <SettingRow
              icon="person-circle-outline"
              label="Edit Profile Name"
              iconBg={Colors.primaryLight}
              iconColor={Colors.primary}
              onPress={() => {
                setEditName(profile?.full_name || profile?.name || '');
                setShowEditProfile(true);
              }}
            />
            <View style={styles.divider} />
            <SettingRow
              icon="call-outline"
              label={profile?.phone_number ? `Phone: ${profile.phone_number}` : 'Add Phone Number'}
              iconBg={Colors.warningLight}
              iconColor={Colors.warning}
              onPress={() => {
                setNewPhone(profile?.phone_number || '');
                setShowChangePhone(true);
              }}
            />
            <View style={styles.divider} />
            <SettingRow
              icon="lock-closed-outline"
              label="Change Password"
              iconBg={Colors.infoLight}
              iconColor={Colors.info}
              onPress={() => {
                setOldPassword('');
                setNewPassword('');
                setShowChangePassword(true);
              }}
            />
          </View>
        </View>

        {/* Support & About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support & About</Text>
          <View style={styles.settingsCard}>
            <SettingRow
              icon="help-circle-outline"
              label="Help Center"
              iconBg={Colors.warningLight}
              iconColor={Colors.warning}
              onPress={() => Alert.alert('Help Center', 'Platform Administration Documentation & Support.')}
            />
            <View style={styles.divider} />
            <SettingRow
              icon="document-text-outline"
              label="Privacy Policy"
              iconBg={Colors.surfaceSubtle}
              iconColor={Colors.textSecondary}
              onPress={() => Alert.alert('Privacy Policy', 'ZeroTask Platform Security and Privacy Policies.')}
            />
          </View>
        </View>

        {/* Sign Out Action */}
        <View style={styles.section}>
          <View style={styles.settingsCard}>
            <SettingRow
              icon="log-out-outline"
              label="Sign Out"
              iconBg={Colors.dangerLight}
              iconColor={Colors.danger}
              onPress={handleSignOut}
              destructive
            />
          </View>
        </View>
      </ScrollView>

      {/* Edit Profile Name Modal */}
      <Modal
        visible={showEditProfile}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowEditProfile(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Profile Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Full Name"
              placeholderTextColor={Colors.textMuted}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowEditProfile(false)}
                disabled={isSaving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveProfile}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Phone Number Modal (Direct) */}
      <Modal
        visible={showChangePhone}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowChangePhone(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Update Phone Number</Text>
            <TextInput
              style={styles.modalInput}
              value={newPhone}
              onChangeText={setNewPhone}
              placeholder="e.g. +971 50 1234567"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowChangePhone(false)}
                disabled={isSaving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleChangePhone}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        visible={showChangePassword}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowChangePassword(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <TextInput
              style={styles.modalInput}
              value={oldPassword}
              onChangeText={setOldPassword}
              placeholder="Current Password"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
            />
            <TextInput
              style={styles.modalInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New Password (min 6 chars)"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowChangePassword(false)}
                disabled={isSaving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleChangePassword}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Update</Text>
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
    paddingBottom: 32,
  },
  profileCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    padding: Layout.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    ...Layout.shadow.card,
  },
  name: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  email: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Layout.spacing.md,
  },
  roleBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: 4,
    borderRadius: Layout.radius.full,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  roleText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
  },
  section: {
    gap: Layout.spacing.sm,
  },
  sectionTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginLeft: Layout.spacing.xs,
  },
  settingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    overflow: 'hidden',
    ...Layout.shadow.card,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Layout.spacing.md,
    gap: Layout.spacing.md,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: Layout.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    flex: 1,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginLeft: 56,
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
    paddingVertical: 10,
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
});
