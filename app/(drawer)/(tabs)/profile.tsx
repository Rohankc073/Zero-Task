import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import { SettingsList, SettingsSection } from '../../../src/components/SettingsList';
import { useRouter } from 'expo-router';
import { User } from '../../../src/types';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

function GoogleCalendarConnect() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'missing',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || 'missing',
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'missing',
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (response?.type === 'success' && response.authentication) {
      saveTokenToSupabase(response.authentication.accessToken, response.authentication.refreshToken);
    }
  }, [response]);

  const saveTokenToSupabase = async (accessToken: string, refreshToken?: string) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('user_integrations').upsert({
      user_id: user.id,
      gcal_access_token: accessToken,
      gcal_refresh_token: refreshToken,
    });
    
    setSaving(false);
    if (!error) {
      Alert.alert("Success", "Google Calendar Synced Successfully!");
    } else {
      Alert.alert("Error", error.message);
    }
  }

  return (
    <TouchableOpacity 
      style={[styles.integrationButton, { backgroundColor: '#4285F4' }]} 
      onPress={() => promptAsync()}
      disabled={!request || saving}
    >
      <Ionicons name="calendar-outline" size={20} color="#fff" style={styles.logoutIcon} />
      <Text style={[styles.integrationButtonText, { color: '#fff' }]}>
        {saving ? 'Syncing...' : 'Connect Google Calendar'}
      </Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { session, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Remove User Modal State (Founder only)
  const [showRemoveUser, setShowRemoveUser] = useState(false);
  const [removeUserEmail, setRemoveUserEmail] = useState('');
  const [isRemovingUser, setIsRemovingUser] = useState(false);

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    try {
      setIsSaving(true);
      const { error } = await supabase.from('users').update({ full_name: editName.trim() }).eq('id', session?.user?.id);
      if (error) throw error;
      setProfile(prev => prev ? { ...prev, full_name: editName.trim() } : null);
      await refreshProfile(); // Refresh global profile context
      setShowEditProfile(false);
      Alert.alert('Success', 'Profile updated successfully.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }
    try {
      setIsSaving(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setShowChangePassword(false);
      setNewPassword('');
      Alert.alert('Success', 'Password updated successfully.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update password.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveUser = async () => {
    if (!removeUserEmail.trim()) {
      Alert.alert('Error', 'Please enter an email address.');
      return;
    }
    
    Alert.alert(
      'Confirm Removal',
      `Are you sure you want to completely remove the user with email "${removeUserEmail.trim()}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsRemovingUser(true);
              const { error } = await supabase.rpc('remove_user_by_email', {
                target_email: removeUserEmail.trim().toLowerCase(),
              });
              
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
        }
      ]
    );
  };

  const pushEnabled = profile?.preferences?.push_notifications ?? true;
  const inAppEnabled = profile?.preferences?.in_app_alerts ?? true;

  useEffect(() => {
    if (session?.user?.id) {
      fetchProfile();
    }
  }, [session?.user?.id]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session!.user.id)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          return;
        }
        throw error;
      }
      setProfile(data);
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
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#e1c37a" />
      </View>
    );
  }

  const sections: SettingsSection[] = [
    {
      title: 'Account & Security',
      items: [
        {
          id: 'edit-profile',
          title: 'Edit Profile Name',
          icon: 'person-circle-outline',
          type: 'link',
          onPress: () => {
            setEditName(profile?.full_name || profile?.name || '');
            setShowEditProfile(true);
          }
        },
        {
          id: 'change-password',
          title: 'Change Password',
          icon: 'lock-closed-outline',
          type: 'link',
          onPress: () => {
            setNewPassword('');
            setShowChangePassword(true);
          }
        }
      ]
    },
    {
      title: 'Support & About',
      items: [
        {
          id: 'help-center',
          title: 'Help Center',
          icon: 'help-circle-outline',
          type: 'link',
          onPress: () => router.push('/help-center')
        },
        {
          id: 'privacy-policy',
          title: 'Privacy Policy',
          icon: 'document-text-outline',
          type: 'link',
          onPress: () => router.push('/privacy-policy')
        }
      ]
    }
  ];

  if (profile?.role === 'Founder') {
    sections.unshift({
      title: 'Administration',
      items: [
        {
          id: 'audit-logs',
          title: 'Audit Logs',
          icon: 'shield-checkmark-outline',
          type: 'link',
          onPress: () => router.push('/audit-logs' as any)
        },
        {
          id: 'remove-user',
          title: 'Remove User',
          icon: 'person-remove-outline',
          type: 'link',
          onPress: () => {
            setRemoveUserEmail('');
            setShowRemoveUser(true);
          }
        }
      ]
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Profile Header */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitials}>
                {profile?.full_name ? profile.full_name.substring(0, 1).toUpperCase() : (profile?.name ? profile.name.substring(0, 1).toUpperCase() : (profile?.email ? profile.email.substring(0, 1).toUpperCase() : 'U'))}
              </Text>
            )}
          </View>
          <Text style={styles.name}>{profile?.full_name || profile?.name || 'User Profile'}</Text>
          <Text style={styles.email}>{profile?.email || session?.user?.email}</Text>
          
          {profile?.role && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{profile.role}</Text>
            </View>
          )}
        </View>

        {/* Settings List */}
        <SettingsList sections={sections} />

        <Text style={styles.sectionTitle}>Integrations</Text>
        <GoogleCalendarConnect />

        {/* Destructive Logout Button */}
        <TouchableOpacity style={styles.destructiveLogoutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color="#f7f6f2" style={styles.logoutIcon} />
          <Text style={styles.destructiveLogoutText}>Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEditProfile} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditProfile(false)}>
                <Ionicons name="close" size={24} color="#0f141a" />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Enter your name"
              placeholderTextColor="#999"
            />
            <TouchableOpacity 
              style={styles.saveButton} 
              onPress={handleSaveProfile}
              disabled={isSaving}
            >
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showChangePassword} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setShowChangePassword(false)}>
                <Ionicons name="close" size={24} color="#0f141a" />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>New Password</Text>
            <TextInput
              style={styles.textInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password"
              placeholderTextColor="#999"
              secureTextEntry
            />
            <TouchableOpacity 
              style={styles.saveButton} 
              onPress={handleChangePassword}
              disabled={isSaving}
            >
              <Text style={styles.saveButtonText}>{isSaving ? 'Updating...' : 'Update Password'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Remove User Modal */}
      <Modal visible={showRemoveUser} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Remove User</Text>
              <TouchableOpacity onPress={() => setShowRemoveUser(false)}>
                <Ionicons name="close" size={24} color="#0f141a" />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>User Email</Text>
            <TextInput
              style={styles.textInput}
              value={removeUserEmail}
              onChangeText={setRemoveUserEmail}
              placeholder="Enter email to remove"
              placeholderTextColor="#999"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity 
              style={[styles.saveButton, { backgroundColor: '#ef4444' }]} 
              onPress={handleRemoveUser}
              disabled={isRemovingUser}
            >
              <Text style={[styles.saveButtonText, { color: '#fff' }]}>
                {isRemovingUser ? 'Removing...' : 'Remove User'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f6f2',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#0f141a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 100,
    height: 100,
  },
  avatarInitials: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#e1c37a',
    fontFamily: 'serif',
  },
  avatarOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  roleBadge: {
    backgroundColor: '#0f141a',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e1c37a',
  },
  roleText: {
    color: '#e1c37a',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  destructiveLogoutButton: {
    marginTop: 20,
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
  },
  logoutIcon: {
    marginRight: 8,
  },
  destructiveLogoutText: {
    color: '#f7f6f2',
    fontSize: 16,
    fontWeight: 'bold',
  },
  integrationButton: {
    marginTop: 10,
    marginBottom: 20,
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  integrationButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 10,
    marginTop: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f141a',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#f7f6f2',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#333',
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: '#0f141a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#e1c37a',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
