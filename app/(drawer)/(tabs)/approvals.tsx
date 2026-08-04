import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/context/AuthContext';
import { Approval, User } from '../../../src/types';
import { ZeroButton } from '../../../src/components/ZeroButton';

type TabType = 'pending' | 'requested' | 'registrations' | 'passwords';

interface PasswordResetRequest {
  id: string;
  employee_id: string;
  status: string;
  created_at: string;
  employee?: User;
}

export default function ApprovalsDashboard() {
  const router = useRouter();
  const { session, profile } = useAuth();
  
  const [tab, setTab] = useState<TabType>('pending');
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [passwordResets, setPasswordResets] = useState<PasswordResetRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Fallback redirect for unauthorized access (e.g. via deep link)
  useEffect(() => {
    if (profile && profile.role === 'Employee') {
      router.replace('/');
    }
  }, [profile, router]);

  // Check if current user is authorized to see the Registrations tab
  const canSeeRegistrations = profile?.role === 'Founder' || profile?.role === 'Department Head' || profile?.role === 'Manager';

  const fetchData = useCallback(async () => {
    if (!session?.user) return;
    try {
      setLoading(true);

      if (tab === 'registrations') {
        let roleFilter = 'Employee';
        if (profile?.role === 'Founder') roleFilter = 'Department Head';
        if (profile?.role === 'Department Head') roleFilter = 'Manager';

        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('role', roleFilter)
          .eq('is_approved', false);

        if (error) throw error;
        setPendingUsers(data as User[]);
      } else if (tab === 'passwords') {
        const { data, error } = await supabase
          .from('password_resets')
          .select('*, employee:users!employee_id(id, email, full_name, role)')
          .eq('status', 'Pending')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setPasswordResets(data as unknown as PasswordResetRequest[]);
      } else {
        const { data, error } = await supabase
          .from('approvals')
          .select(`
            *,
            task:tasks(*),
            requester:users!requester_id(id, email),
            approver:users!approver_id(id, email)
          `)
          .eq(tab === 'pending' ? 'approver_id' : 'requester_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setApprovals(data as unknown as Approval[]);
      }
    } catch (error: any) {
      console.error(`Error fetching ${tab}:`, error.message);
    } finally {
      setLoading(false);
    }
  }, [session?.user, tab]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const handleTaskAction = useCallback(async (approvalId: string, action: 'approved' | 'rejected', requesterId: string) => {
    try {
      setLoading(true);
      const { error: updateError } = await supabase
        .from('approvals')
        .update({ status: action, updated_at: new Date().toISOString() })
        .eq('id', approvalId);

      if (updateError) throw updateError;

      const { error: notifyError } = await supabase
        .from('notifications')
        .insert({
          user_id: requesterId,
          title: `Task ${action.charAt(0).toUpperCase() + action.slice(1)}`,
          body: `Your task approval request has been ${action}.`,
          type: 'approval',
        });

      if (notifyError) throw notifyError;

      Alert.alert('Success', `Task ${action} successfully.`);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.message || `Failed to ${action} task`);
      setLoading(false);
    }
  }, [fetchData]);

  const handleUserApproval = useCallback(async (userId: string, userEmail: string) => {
    try {
      setLoading(true);
      // Remove instantly from UI
      setPendingUsers(prev => prev.filter(u => u.id !== userId));

      const { error } = await supabase
        .from('users')
        .update({ is_approved: true })
        .eq('id', userId);

      if (error) throw error;
      
      // Notify Founders
      const { data: founders } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'Founder');
        
      if (founders && founders.length > 0) {
        const approverName = profile?.full_name || profile?.email || 'Someone';
        const notifications = founders.map(f => ({
          user_id: f.id,
          title: 'User Approved',
          message: `User ${userEmail} was approved by ${approverName} (${profile?.role}).`
        }));
        await supabase.from('in_app_notifications').insert(notifications);
      }
      
      Alert.alert('Success', 'User has been approved and can now access the system.');
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.message || `Failed to approve user`);
      setLoading(false);
    }
  }, [fetchData, profile]);

  const handleUserRejection = useCallback(async (userId: string, userEmail: string) => {
    Alert.alert(
      'Reject User',
      'Are you sure you want to reject this user? Their pending account will be deleted so they can try again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              // Remove instantly from UI
              setPendingUsers(prev => prev.filter(u => u.id !== userId));

              const { error } = await supabase.rpc('reject_user', { target_user_id: userId });

              if (error) throw error;
              
              // Notify Founders
              const { data: founders } = await supabase
                .from('users')
                .select('id')
                .eq('role', 'Founder');
                
              if (founders && founders.length > 0) {
                const rejectorName = profile?.full_name || profile?.email || 'Someone';
                const notifications = founders.map(f => ({
                  user_id: f.id,
                  title: 'User Rejected',
                  message: `User ${userEmail} was rejected by ${rejectorName} (${profile?.role}).`
                }));
                await supabase.from('in_app_notifications').insert(notifications);
              }
              
              Alert.alert('Rejected', 'User has been rejected and removed.');
              fetchData();
            } catch (error: any) {
              Alert.alert('Error', error.message || `Failed to reject user`);
              setLoading(false);
            }
          }
        }
      ]
    );
  }, [fetchData, profile]);

  const handlePasswordResetSubmit = async () => {
    if (!newPassword || newPassword.length < 7) {
      Alert.alert('Error', 'Password must be at least 7 characters long.');
      return;
    }
    if (!selectedRequestId) return;

    try {
      setLoading(true);
      const { error } = await supabase.rpc('manager_reset_employee_password', {
        p_request_id: selectedRequestId,
        p_new_password: newPassword
      });

      if (error) throw error;

      Alert.alert('Success', 'Password has been updated. Please share the temporary password with the employee.');
      setResetModalVisible(false);
      setNewPassword('');
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  const renderApprovalItem = useCallback(({ item }: { item: Approval }) => {
    const isPendingTab = tab === 'pending';
    const isPendingStatus = item.status === 'pending';

    let statusColor = '#3b82f6'; // pending blue
    if (item.status === 'approved') statusColor = '#10b981'; // green
    if (item.status === 'rejected') statusColor = '#ef4444'; // red

    return (
      <View className="bg-white p-4 rounded-2xl shadow-sm mb-4 border border-gray-100">
        <View className="flex-row justify-between items-start mb-2">
          <Text className="text-[#0f141a] font-bold flex-1 mr-2" numberOfLines={2}>
            {item.task?.title || 'Unknown Task'}
          </Text>
          <View style={{ backgroundColor: statusColor + '20' }} className="px-2 py-1 rounded-md">
            <Text style={{ color: statusColor }} className="text-xs font-bold uppercase">{item.status}</Text>
          </View>
        </View>

        {isPendingTab ? (
          <Text className="text-gray-500 text-sm mb-4">
            Requested by: <Text className="font-semibold text-gray-700">{item.requester?.email}</Text>
          </Text>
        ) : (
          <Text className="text-gray-500 text-sm mb-4">
            Approver: <Text className="font-semibold text-gray-700">{item.approver?.email}</Text>
          </Text>
        )}

        {isPendingTab && isPendingStatus && (
          <View className="flex-row space-x-3">
            <View className="flex-1 mr-2">
              <ZeroButton 
                title="Approve" 
                onPress={() => handleTaskAction(item.id, 'approved', item.requester_id)} 
                style={{ paddingVertical: 8 }}
                disabled={loading}
              />
            </View>
            <View className="flex-1 ml-2">
              <ZeroButton 
                title="Reject" 
                variant="outline"
                onPress={() => handleTaskAction(item.id, 'rejected', item.requester_id)} 
                style={{ paddingVertical: 8 }}
                disabled={loading}
              />
            </View>
          </View>
        )}

        <TouchableOpacity 
          className="mt-3 flex-row items-center justify-center border-t border-gray-100 pt-3"
          onPress={() => router.push(`/task/${item.task_id}` as any)}
        >
          <Text className="text-[#e1c37a] font-semibold mr-1">View Task Details</Text>
          <Ionicons name="arrow-forward" size={14} color="#e1c37a" />
        </TouchableOpacity>
      </View>
    );
  }, [tab, handleTaskAction, router, loading]);

  const renderPendingUserItem = useCallback(({ item }: { item: User }) => {
    return (
      <View className="bg-white p-4 rounded-2xl shadow-sm mb-4 border border-gray-100">
        <View className="flex-row justify-between items-start mb-2">
          <Text className="text-[#0f141a] font-bold flex-1 mr-2" numberOfLines={1}>
            {item.email}
          </Text>
          <View className="bg-[#e1c37a]/20 px-2 py-1 rounded-md">
            <Text className="text-[#e1c37a] text-xs font-bold uppercase">{item.role}</Text>
          </View>
        </View>

        <Text className="text-gray-500 text-sm mb-4">
          Name: <Text className="font-semibold text-gray-700">{item.full_name || 'N/A'}</Text>
        </Text>

        <View className="flex-row space-x-3">
          <View className="flex-1 mr-2">
            <ZeroButton 
              title="Approve User" 
              onPress={() => handleUserApproval(item.id, item.email)} 
              style={{ paddingVertical: 8 }}
              disabled={loading}
            />
          </View>
          <View className="flex-1 ml-2">
            <ZeroButton 
              title="Reject" 
              variant="outline"
              onPress={() => handleUserRejection(item.id, item.email)} 
              style={{ paddingVertical: 8 }}
              disabled={loading}
            />
          </View>
        </View>
      </View>
    );
  }, [handleUserApproval, loading]);

  const renderPasswordResetItem = useCallback(({ item }: { item: PasswordResetRequest }) => {
    return (
      <View className="bg-white p-4 rounded-2xl shadow-sm mb-4 border border-gray-100">
        <View className="flex-row justify-between items-start mb-2">
          <Text className="text-[#0f141a] font-bold flex-1 mr-2" numberOfLines={1}>
            {item.employee?.email}
          </Text>
          <View className="bg-[#ef4444]/20 px-2 py-1 rounded-md">
            <Text className="text-[#ef4444] text-xs font-bold uppercase">Reset Request</Text>
          </View>
        </View>

        <Text className="text-gray-500 text-sm mb-4">
          Employee: <Text className="font-semibold text-gray-700">{item.employee?.full_name || 'N/A'}</Text>
        </Text>

        <View className="flex-row space-x-3">
          <View className="flex-1 mr-2">
            <ZeroButton 
              title="Set Temporary Password" 
              onPress={() => {
                setSelectedRequestId(item.id);
                setResetModalVisible(true);
              }} 
              style={{ paddingVertical: 8 }}
              disabled={loading}
            />
          </View>
        </View>
      </View>
    );
  }, [loading]);

  return (
    <View className="flex-1 bg-[#f7f6f2]">
      {/* Segmented Control */}
      <View className="flex-row p-4 pt-6">
        <TouchableOpacity 
          className={`flex-1 py-3 ${canSeeRegistrations ? 'rounded-l-xl' : 'rounded-l-xl'} items-center border ${tab === 'pending' ? 'bg-[#0f141a] border-[#0f141a]' : 'bg-white border-gray-300 border-r-0'}`}
          onPress={() => setTab('pending')}
        >
          <Text className={`font-bold text-xs md:text-sm ${tab === 'pending' ? 'text-[#e1c37a]' : 'text-gray-500'}`}>Pending</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          className={`flex-1 py-3 items-center border ${!canSeeRegistrations ? 'rounded-r-xl border-l-0' : 'border-x-0'} ${tab === 'requested' ? 'bg-[#0f141a] border-[#0f141a]' : 'bg-white border-gray-300'}`}
          onPress={() => setTab('requested')}
        >
          <Text className={`font-bold text-xs md:text-sm ${tab === 'requested' ? 'text-[#e1c37a]' : 'text-gray-500'}`}>My Requests</Text>
        </TouchableOpacity>

        {canSeeRegistrations && (
          <TouchableOpacity 
            className={`flex-1 py-3 items-center border ${tab === 'registrations' ? 'bg-[#0f141a] border-[#0f141a]' : 'bg-white border-gray-300 border-l-0 border-r-0'}`}
            onPress={() => setTab('registrations')}
          >
            <Text className={`font-bold text-xs md:text-sm ${tab === 'registrations' ? 'text-[#e1c37a]' : 'text-gray-500'}`}>Onboarding</Text>
          </TouchableOpacity>
        )}

        {canSeeRegistrations && (
          <TouchableOpacity 
            className={`flex-1 py-3 rounded-r-xl items-center border ${tab === 'passwords' ? 'bg-[#0f141a] border-[#0f141a]' : 'bg-white border-gray-300 border-l-0'}`}
            onPress={() => setTab('passwords')}
          >
            <Text className={`font-bold text-xs md:text-sm ${tab === 'passwords' ? 'text-[#e1c37a]' : 'text-gray-500'}`}>Passwords</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {tab === 'passwords' ? (
        <FlashList estimatedItemSize={100}
          data={passwordResets}
          keyExtractor={item => item.id}
          renderItem={renderPasswordResetItem}
          contentContainerStyle={{ padding: 16 }}
          refreshing={loading}
          onRefresh={fetchData}
          ListEmptyComponent={
            !loading ? (
              <View className="items-center justify-center py-20">
                <Ionicons name="key-outline" size={64} color="#ccc" />
                <Text className="text-gray-400 mt-4 text-center">
                  No password reset requests.
                </Text>
              </View>
            ) : null
          }
        />
      ) : tab === 'registrations' ? (
        <FlashList estimatedItemSize={100}
          data={pendingUsers}
          keyExtractor={item => item.id}
          renderItem={renderPendingUserItem}
          contentContainerStyle={{ padding: 16 }}
          refreshing={loading}
          onRefresh={fetchData}
          ListEmptyComponent={
            !loading ? (
              <View className="items-center justify-center py-20">
                <Ionicons name="people-outline" size={64} color="#ccc" />
                <Text className="text-gray-400 mt-4 text-center">
                  No pending registration requests.
                </Text>
              </View>
            ) : null
          }
        />
      ) : (
        <FlashList estimatedItemSize={100}
          data={approvals}
          keyExtractor={item => item.id}
          renderItem={renderApprovalItem}
          contentContainerStyle={{ padding: 16 }}
          refreshing={loading}
          onRefresh={fetchData}
          ListEmptyComponent={
            !loading ? (
              <View className="items-center justify-center py-20">
                <Ionicons name="shield-checkmark-outline" size={64} color="#ccc" />
                <Text className="text-gray-400 mt-4 text-center">
                  {tab === 'pending' 
                    ? 'You have no pending approvals.' 
                    : 'You have not requested any approvals.'}
                </Text>
              </View>
            ) : null
          }
        />
      )}

      {/* Password Reset Modal */}
      <Modal visible={resetModalVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-full rounded-3xl p-6 shadow-xl">
            <Text className="text-xl font-bold text-[#0f141a] mb-2">Set New Password</Text>
            <Text className="text-gray-500 text-sm mb-6">
              Enter a temporary password for the employee. Ensure you communicate this securely to them.
            </Text>
            
            <View className="mb-6">
              <Text className="text-sm font-semibold text-gray-700 mb-2">New Password</Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="e.g. Temp@1234"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-[#0f141a]"
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <View className="flex-row space-x-3">
              <View className="flex-1 mr-2">
                <ZeroButton 
                  title="Cancel" 
                  variant="outline"
                  onPress={() => {
                    setResetModalVisible(false);
                    setNewPassword('');
                  }} 
                />
              </View>
              <View className="flex-1 ml-2">
                <ZeroButton 
                  title="Save" 
                  onPress={handlePasswordResetSubmit}
                  loading={loading}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
