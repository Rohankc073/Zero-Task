import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/context/AuthContext';
import { Approval, User } from '../../../src/types';
import { ZeroButton } from '../../../src/components/ZeroButton';
import { AnimatedPressable } from '../../../src/components/ui/AnimatedPressable';

type TabType = 'pending' | 'requested' | 'meetings' | 'registrations' | 'passwords' | 'phone_changes';

interface PasswordResetRequest {
  id: string;
  employee_id: string;
  status: string;
  created_at: string;
  employee?: User;
}

interface PhoneChangeRequest {
  id: string;
  user_id: string;
  new_phone_number: string;
  status: string;
  created_at: string;
  requester?: User;
}

export default function ApprovalsDashboard() {
  const router = useRouter();
  const { session, profile } = useAuth();
  
  const [tab, setTab] = useState<TabType>('pending');
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [meetingApprovals, setMeetingApprovals] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [passwordResets, setPasswordResets] = useState<PasswordResetRequest[]>([]);
  const [phoneRequests, setPhoneRequests] = useState<PhoneChangeRequest[]>([]);
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

      if (tab === 'meetings') {
        let meetingQuery = supabase
          .from('meeting_approvals')
          .select(`
            *,
            meeting:meetings(*, organizer:users!organizer_id(id, full_name, role, email)),
            requester:users!requester_id(id, full_name, role, email)
          `)
          .order('created_at', { ascending: false });

        if (profile?.role !== 'Founder') {
          meetingQuery = meetingQuery.eq('approver_id', session.user.id);
        }

        const { data: mData, error: mError } = await meetingQuery;
        if (mError) throw mError;
        setMeetingApprovals(mData || []);
      } else if (tab === 'registrations') {
        let roleFilter = 'Employee';
        if (profile?.role === 'Founder') roleFilter = 'Department Head';
        if (profile?.role === 'Department Head') roleFilter = 'Manager';

        // For managers, roleFilter is 'Employee' natively.
        // Build the query
        let query = supabase
          .from('users')
          .select('*')
          .eq('role', roleFilter)
          .eq('status', 'Pending')
          .eq('is_approved', false);
          
        // Scope to department if not founder
        if (profile?.role === 'Department Head' || profile?.role === 'Manager') {
          if (profile.department_id) {
            query = query.eq('department_id', profile.department_id);
          } else {
            query = query.is('department_id', null);
          }
        }

        const { data, error } = await query;

        if (error) throw error;
        setPendingUsers(data as User[]);
      } else if (tab === 'passwords') {
        const { data, error } = await supabase
          .from('password_resets')
          .select('*, employee:users!user_id(id, email, full_name, role)')
          .eq('status', 'Pending')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setPasswordResets(data as unknown as PasswordResetRequest[]);
      } else if (tab === 'phone_changes') {
        let query = supabase
          .from('phone_change_requests')
          .select('*, requester:users!user_id(id, email, full_name, role, phone_number, department:departments(name))')
          .eq('status', 'Pending')
          .order('created_at', { ascending: false });

        if (profile?.role !== 'Founder') {
          query = query.eq('approver_id', session.user.id);
        }

        const { data, error } = await query;
        if (error) throw error;
        setPhoneRequests(data as unknown as PhoneChangeRequest[]);
      } else {
        const { data, error } = await supabase
          .from('approvals')
          .select(`
            *,
            task:tasks(*),
            requester:users!requester_id(id, email, full_name, role),
            approver:users!approver_id(id, email, full_name, role)
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
        .update({ is_approved: true, status: 'Approved' })
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

  const handlePhoneChangeApproval = async (requestId: string, action: 'Approved' | 'Rejected') => {
    try {
      setLoading(true);
      const { error } = await supabase.rpc('process_phone_change_approval', {
        p_request_id: requestId,
        p_action: action
      });
      if (error) throw error;
      Alert.alert('Success', `Phone change request ${action}.`);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to process request.');
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
      <Animated.View entering={FadeInDown.duration(240)}>
        <View className="bg-[#F0E8DA] p-4 rounded-2xl shadow-sm mb-4 border border-[#C3B7A5]">
          <View className="flex-row justify-between items-start mb-2">
          <Text className="text-[#24221F] font-bold flex-1 mr-2" numberOfLines={2}>
            {item.task?.title || 'Unknown Task'}
          </Text>
          <View style={{ backgroundColor: statusColor + '20' }} className="px-2 py-1 rounded-md">
            <Text style={{ color: statusColor }} className="text-xs font-bold uppercase">{item.status}</Text>
          </View>
        </View>

        {isPendingTab ? (
          <Text className="text-gray-500 text-sm mb-4">
            Requested by: <Text className="font-semibold text-gray-700">{item.requester?.full_name || item.requester?.email} {item.requester?.role ? `(${item.requester.role})` : ''}</Text>
          </Text>
        ) : (
          <Text className="text-gray-500 text-sm mb-4">
            Approver: <Text className="font-semibold text-gray-700">{item.approver?.full_name || item.approver?.email} {item.approver?.role ? `(${item.approver.role})` : ''}</Text>
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

          <AnimatedPressable 
            className="mt-3 flex-row items-center justify-center border-t border-[#C3B7A5] pt-3"
            onPress={() => router.push(`/task/${item.task_id}` as any)}
            scaleTo={0.98}
          >
            <Text className="text-[#5F5A52] font-semibold mr-1">View Task Details</Text>
            <Ionicons name="arrow-forward" size={14} color="#5F5A52" />
          </AnimatedPressable>
        </View>
      </Animated.View>
    );
  }, [tab, handleTaskAction, router, loading]);

  const renderPendingUserItem = useCallback(({ item }: { item: User }) => {
    return (
      <View className="bg-[#F0E8DA] p-4 rounded-2xl shadow-sm mb-4 border border-[#C3B7A5]">
        <View className="flex-row justify-between items-start mb-2">
          <Text className="text-[#24221F] font-bold flex-1 mr-2" numberOfLines={1}>
            {item.email}
          </Text>
          <View className="bg-[#D7BE72]/30 px-2 py-1 rounded-md">
            <Text className="text-[#24221F] text-xs font-bold uppercase">{item.role}</Text>
          </View>
        </View>

        <Text className="text-gray-500 text-sm mb-4">
          Name: <Text className="font-semibold text-gray-700">{item.full_name || 'N/A'}</Text>
        </Text>

        <View className="flex-row space-x-3">
          <View className="flex-1 mr-2">
            <ZeroButton 
              title="Approve User" 
              onPress={() => handleUserApproval(item.id, item.email || '')} 
              style={{ paddingVertical: 8 }}
              disabled={loading}
            />
          </View>
          <View className="flex-1 ml-2">
            <ZeroButton 
              title="Reject" 
              variant="outline"
              onPress={() => handleUserRejection(item.id, item.email || '')} 
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
      <View className="bg-[#F0E8DA] p-4 rounded-2xl shadow-sm mb-4 border border-[#C3B7A5]">
        <View className="flex-row justify-between items-start mb-2">
          <Text className="text-[#24221F] font-bold flex-1 mr-2" numberOfLines={1}>
            {item.employee?.email}
          </Text>
          <View className="bg-[#D98F79]/30 px-2 py-1 rounded-md">
            <Text className="text-[#D98F79] text-xs font-bold uppercase">Reset Request</Text>
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

  const renderPhoneChangeItem = useCallback(({ item }: { item: PhoneChangeRequest }) => {
    const isPending = item.status === 'Pending';
    const requester = item.requester as any;
    const departmentName = requester?.department?.name || 'General';
    const currentPhone = requester?.phone_number || 'Not set';

    return (
      <View className="bg-[#F0E8DA] p-4 rounded-2xl shadow-sm mb-4 border border-[#C3B7A5]">
        {/* Header with Title and Status */}
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-row items-center flex-1 mr-2">
            <View className="w-8 h-8 rounded-full bg-[#D98F79]/20 items-center justify-center mr-2">
              <Ionicons name="call-outline" size={16} color="#D98F79" />
            </View>
            <View className="flex-1">
              <Text className="text-[#24221F] font-bold text-sm" numberOfLines={1}>
                Phone Number Change
              </Text>
              <Text className="text-[#81796D] text-xs">
                {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
          <View className="bg-[#D98F79]/20 px-2.5 py-1 rounded-md border border-[#D98F79]/30">
            <Text className="text-[#D98F79] text-xs font-bold uppercase">{item.status}</Text>
          </View>
        </View>

        {/* Requester & Department Section */}
        <View className="bg-[#E8E0D2] p-3 rounded-xl mb-3 border border-[#C3B7A5]/50">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center flex-1 mr-2">
              <Text className="text-[#24221F] font-bold text-sm" numberOfLines={1}>
                {requester?.full_name || requester?.email || 'Employee'}
              </Text>
              {requester?.role && (
                <View className="bg-[#D7BE72]/30 px-2 py-0.5 rounded-md ml-2">
                  <Text className="text-[#24221F] text-[10px] font-bold uppercase">{requester.role}</Text>
                </View>
              )}
            </View>
            <View className="bg-[#24221F]/10 px-2 py-0.5 rounded-md">
              <Text className="text-[#5F5A52] text-[10px] font-semibold uppercase">{departmentName}</Text>
            </View>
          </View>

          {/* Numbers comparison */}
          <View className="flex-row items-center justify-between pt-1 border-t border-[#C3B7A5]/40">
            <View className="flex-1">
              <Text className="text-[#81796D] text-[11px] font-medium">Current Number</Text>
              <Text className="text-[#5F5A52] text-xs font-semibold">{currentPhone}</Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color="#81796D" style={{ marginHorizontal: 8 }} />
            <View className="flex-1 items-end">
              <Text className="text-[#D98F79] text-[11px] font-bold">New Requested</Text>
              <Text className="text-[#24221F] text-xs font-bold">{item.new_phone_number}</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        {isPending && (
          <View className="flex-row space-x-3">
            <View className="flex-1 mr-2">
              <ZeroButton 
                title="Approve Change" 
                onPress={() => handlePhoneChangeApproval(item.id, 'Approved')} 
                style={{ paddingVertical: 8 }}
                disabled={loading}
              />
            </View>
            <View className="flex-1 ml-2">
              <ZeroButton 
                title="Reject" 
                variant="outline"
                onPress={() => handlePhoneChangeApproval(item.id, 'Rejected')} 
                style={{ paddingVertical: 8 }}
                disabled={loading}
              />
            </View>
          </View>
        )}
      </View>
    );
  }, [loading, handlePhoneChangeApproval]);

  return (
    <View className="flex-1 bg-[#E8E0D2]">
      {/* Segmented Control */}
      <View className="flex-row p-4 pt-6">
        <AnimatedPressable 
          className={`flex-1 py-3 ${canSeeRegistrations ? 'rounded-l-xl' : 'rounded-l-xl'} items-center border ${tab === 'pending' ? 'bg-[#24221F] border-[#24221F]' : 'bg-[#F0E8DA] border-[#C3B7A5] border-r-0'}`}
          onPress={() => setTab('pending')}
          scaleTo={0.95}
        >
          <Text className={`font-bold text-xs md:text-sm ${tab === 'pending' ? 'text-[#F0E8DA]' : 'text-[#81796D]'}`}>Pending</Text>
        </AnimatedPressable>
        
        <AnimatedPressable 
          className={`flex-1 py-3 items-center border ${tab === 'requested' ? 'bg-[#24221F] border-[#24221F]' : 'bg-[#F0E8DA] border-[#C3B7A5] border-l-0'}`}
          onPress={() => setTab('requested')}
          scaleTo={0.95}
        >
          <Text className={`font-bold text-xs md:text-sm ${tab === 'requested' ? 'text-[#F0E8DA]' : 'text-[#81796D]'}`}>My Requests</Text>
        </AnimatedPressable>

        <AnimatedPressable 
          className={`flex-1 py-3 items-center border ${tab === 'meetings' ? 'bg-[#24221F] border-[#24221F]' : 'bg-[#F0E8DA] border-[#C3B7A5] border-l-0'}`}
          onPress={() => setTab('meetings')}
          scaleTo={0.95}
        >
          <Text className={`font-bold text-xs md:text-sm ${tab === 'meetings' ? 'text-[#F0E8DA]' : 'text-[#81796D]'}`}>Meetings</Text>
        </AnimatedPressable>

        <AnimatedPressable 
          className={`flex-1 py-3 items-center border ${tab === 'phone_changes' ? 'bg-[#24221F] border-[#24221F]' : 'bg-[#F0E8DA] border-[#C3B7A5] border-l-0'}`}
          onPress={() => setTab('phone_changes')}
          scaleTo={0.95}
        >
          <Text className={`font-bold text-xs md:text-sm ${tab === 'phone_changes' ? 'text-[#F0E8DA]' : 'text-[#81796D]'}`}>Phones</Text>
        </AnimatedPressable>

        {canSeeRegistrations && (
          <AnimatedPressable 
            className={`flex-1 py-3 items-center border ${tab === 'registrations' ? 'bg-[#24221F] border-[#24221F]' : 'bg-[#F0E8DA] border-[#C3B7A5] border-l-0'}`}
            onPress={() => setTab('registrations')}
            scaleTo={0.95}
          >
            <Text className={`font-bold text-xs md:text-sm ${tab === 'registrations' ? 'text-[#F0E8DA]' : 'text-[#81796D]'}`}>Onboarding</Text>
          </AnimatedPressable>
        )}

        {canSeeRegistrations && (
          <AnimatedPressable 
            className={`flex-1 py-3 rounded-r-xl items-center border ${tab === 'passwords' ? 'bg-[#24221F] border-[#24221F]' : 'bg-[#F0E8DA] border-[#C3B7A5] border-l-0'}`}
            onPress={() => setTab('passwords')}
            scaleTo={0.95}
          >
            <Text className={`font-bold text-xs md:text-sm ${tab === 'passwords' ? 'text-[#F0E8DA]' : 'text-[#81796D]'}`}>Passwords</Text>
          </AnimatedPressable>
        )}
      </View>

      {/* List */}
      {tab === 'meetings' ? (
        <FlashList
          data={meetingApprovals}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const isPending = item.status === 'Pending';
            return (
              <View className="bg-[#F0E8DA] p-4 rounded-2xl shadow-sm mb-4 border border-[#C3B7A5]">
                <View className="flex-row justify-between items-start mb-2">
                  <Text className="text-[#24221F] font-bold flex-1 mr-2" numberOfLines={1}>
                    {item.meeting?.title || 'Meeting Request'}
                  </Text>
                  <View style={{ backgroundColor: (isPending ? '#d97706' : item.status === 'Approved' ? '#10b981' : '#ef4444') + '20' }} className="px-2 py-1 rounded-md">
                    <Text style={{ color: isPending ? '#d97706' : item.status === 'Approved' ? '#10b981' : '#ef4444' }} className="text-xs font-bold uppercase">
                      {item.status}
                    </Text>
                  </View>
                </View>

                <Text className="text-gray-500 text-xs mb-1">
                  Requester: <Text className="font-semibold text-gray-700">{item.requester?.full_name} ({item.requester?.role})</Text>
                </Text>
                <Text className="text-gray-500 text-xs mb-3">
                  Step: <Text className="font-semibold text-gray-700">{item.approver_role} (Step {item.sequence_order})</Text>
                  {item.meeting?.start_time ? ` · ${new Date(item.meeting.start_time).toLocaleDateString()} at ${new Date(item.meeting.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                </Text>

                {isPending && (
                  <View className="flex-row space-x-3 mb-2">
                    <View className="flex-1 mr-2">
                      <ZeroButton
                        title="Approve"
                        onPress={async () => {
                          try {
                            setLoading(true);
                            await supabase.rpc('process_meeting_approval', {
                              p_approval_id: item.id,
                              p_action: 'Approved'
                            });
                            fetchData();
                          } catch (err: any) {
                            Alert.alert('Error', err.message);
                            setLoading(false);
                          }
                        }}
                        style={{ paddingVertical: 8 }}
                      />
                    </View>
                    <View className="flex-1 ml-2">
                      <ZeroButton
                        title="Reject"
                        variant="outline"
                        onPress={async () => {
                          try {
                            setLoading(true);
                            await supabase.rpc('process_meeting_approval', {
                              p_approval_id: item.id,
                              p_action: 'Rejected',
                              p_reason: 'Rejected from approvals dashboard'
                            });
                            fetchData();
                          } catch (err: any) {
                            Alert.alert('Error', err.message);
                            setLoading(false);
                          }
                        }}
                        style={{ paddingVertical: 8 }}
                      />
                    </View>
                  </View>
                )}

                <TouchableOpacity 
                  className="mt-2 flex-row items-center justify-center border-t border-[#C3B7A5] pt-2"
                  onPress={() => router.push(`/meeting/${item.meeting_id}` as any)}
                >
                  <Text className="text-[#5F5A52] font-semibold mr-1 text-xs">View Full Meeting</Text>
                  <Ionicons name="arrow-forward" size={12} color="#5F5A52" />
                </TouchableOpacity>
              </View>
            );
          }}
          contentContainerStyle={{ padding: 16 }}
          refreshing={loading}
          onRefresh={fetchData}
          ListEmptyComponent={
            !loading ? (
              <View className="items-center justify-center py-20">
                <Ionicons name="calendar-outline" size={64} color="#ccc" />
                <Text className="text-gray-400 mt-4 text-center">
                  No meeting requests found.
                </Text>
              </View>
            ) : null
          }
        />
      ) : tab === 'passwords' ? (
        <FlashList
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
      ) : tab === 'phone_changes' ? (
        <FlashList
          data={phoneRequests}
          keyExtractor={item => item.id}
          renderItem={renderPhoneChangeItem}
          contentContainerStyle={{ padding: 16 }}
          refreshing={loading}
          onRefresh={fetchData}
          ListEmptyComponent={
            !loading ? (
              <View className="items-center justify-center py-20">
                <Ionicons name="call-outline" size={64} color="#ccc" />
                <Text className="text-gray-400 mt-4 text-center">
                  No phone change requests.
                </Text>
              </View>
            ) : null
          }
        />
      ) : tab === 'registrations' ? (
        <FlashList
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
        <FlashList
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
          <View className="bg-[#F0E8DA] w-full rounded-3xl p-6 shadow-xl border border-[#C3B7A5]">
            <Text className="text-xl font-bold text-[#24221F] mb-2">Set New Password</Text>
            <Text className="text-[#5F5A52] text-sm mb-6">
              Enter a temporary password for the employee. Ensure you communicate this securely to them.
            </Text>
            
            <View className="mb-6">
              <Text className="text-sm font-semibold text-[#5F5A52] mb-2">New Password</Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="e.g. Temp@1234"
                placeholderTextColor="#81796D"
                className="w-full bg-[#E8E0D2] border border-[#C3B7A5] rounded-xl p-4 text-[#24221F]"
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
