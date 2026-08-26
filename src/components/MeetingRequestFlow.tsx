import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Colors, Typography, Layout } from '../theme/tokens';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';

interface MeetingRequest {
  id: string;
  requester_id: string;
  approver_id: string;
  meeting_id: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reason: string;
  created_at: string;
  requester?: { full_name: string; role: string };
  meeting?: { title: string; start_time: string };
}

export const MeetingRequestFlow = () => {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<MeetingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, [profile]);

  const fetchRequests = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('meeting_requests')
        .select(`
          *,
          requester:users!meeting_requests_requester_id_fkey(full_name, role),
          meeting:meetings(title, start_time)
        `)
        .or(`requester_id.eq.${profile.id},approver_id.eq.${profile.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data as any);
    } catch (err: any) {
      console.error('Error fetching meeting requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: 'Approved' | 'Rejected') => {
    try {
      const { error } = await supabase
        .from('meeting_requests')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      
      setRequests(prev => prev.map(req => req.id === id ? { ...req, status: newStatus } : req));
      Alert.alert('Success', `Meeting request ${newStatus.toLowerCase()}.`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  if (loading) {
    return <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 24 }} />;
  }

  if (requests.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="calendar-outline" size={48} color={Colors.borderStrong} />
        <Text style={styles.emptyTitle}>No Meeting Requests</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={requests}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const isApprover = item.approver_id === profile?.id;
          
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.meetingTitle}>{item.meeting?.title || 'Unknown Meeting'}</Text>
                <View style={[
                  styles.statusBadge, 
                  item.status === 'Approved' ? styles.statusApproved : 
                  item.status === 'Rejected' ? styles.statusRejected : styles.statusPending
                ]}>
                  <Text style={[
                    styles.statusText,
                    item.status === 'Approved' ? styles.statusTextApproved : 
                    item.status === 'Rejected' ? styles.statusTextRejected : styles.statusTextPending
                  ]}>{item.status}</Text>
                </View>
              </View>

              <Text style={styles.subtitle}>
                Requested by: <Text style={{ fontFamily: Typography.fontFamily.semiBold }}>{item.requester?.full_name}</Text> ({item.requester?.role})
              </Text>

              {item.meeting?.start_time && (
                <Text style={styles.subtitle}>
                  Time: {new Date(item.meeting.start_time).toLocaleString()}
                </Text>
              )}

              {item.reason && (
                <Text style={styles.reason}>Reason: {item.reason}</Text>
              )}

              {isApprover && item.status === 'Pending' && (
                <View style={styles.actions}>
                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: Colors.semanticPeach }]}
                    onPress={() => handleUpdateStatus(item.id, 'Rejected')}
                  >
                    <Text style={styles.actionText}>Reject</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: Colors.success }]}
                    onPress={() => handleUpdateStatus(item.id, 'Approved')}
                  >
                    <Text style={styles.actionText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Layout.spacing.lg,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: 16,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
  },
  card: {
    backgroundColor: Colors.surface,
    padding: Layout.spacing.md,
    borderRadius: Layout.radius.lg,
    marginBottom: Layout.spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  meetingTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Layout.radius.full,
  },
  statusPending: { backgroundColor: Colors.semanticYellow + '20' },
  statusApproved: { backgroundColor: Colors.success + '20' },
  statusRejected: { backgroundColor: Colors.semanticPeach + '20' },
  
  statusText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xs,
  },
  statusTextPending: { color: Colors.semanticYellow },
  statusTextApproved: { color: Colors.success },
  statusTextRejected: { color: Colors.semanticPeach },

  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  reason: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 8,
    backgroundColor: Colors.background,
    padding: 8,
    borderRadius: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Layout.radius.md,
  },
  actionText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
  },
});
