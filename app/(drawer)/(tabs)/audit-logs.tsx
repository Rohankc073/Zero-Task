import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { supabase } from '../../../src/lib/supabase';
import { AuditLog } from '../../../src/types';

export default function AuditLogsScreen() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.role === 'Founder') {
      fetchLogs();
    } else {
      setLoading(false);
    }
  }, [profile]);

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*, user:users(email, full_name)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#e1c37a" />
      </SafeAreaView>
    );
  }

  // Unauthorized Fallback
  if (profile?.role !== 'Founder') {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Ionicons name="lock-closed-outline" size={64} color="#ef4444" style={{ marginBottom: 20 }} />
        <Text style={styles.unauthorizedTitle}>Unauthorized Access</Text>
        <Text style={styles.unauthorizedText}>
          This section is strictly restricted to Founder-level accounts.
        </Text>
      </SafeAreaView>
    );
  }

  const renderLogItem = ({ item }: { item: AuditLog }) => {
    const formattedDate = new Date(item.created_at).toLocaleString();
    const userDisplay = item.user?.full_name || item.user?.email || 'Unknown User';

    return (
      <View style={styles.logCard}>
        <View style={styles.logHeader}>
          <Text style={styles.logAction}>{item.action_type.replace(/_/g, ' ')}</Text>
          <Text style={styles.logDate}>{formattedDate}</Text>
        </View>
        <Text style={styles.logDescription}>{item.description}</Text>
        <View style={styles.logFooter}>
          <Ionicons name="person-circle-outline" size={16} color="#666" style={{ marginRight: 4 }} />
          <Text style={styles.logUser}>{userDisplay}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Enterprise Audit Trail</Text>
        <Text style={styles.subtitle}>Immutable log of critical system actions</Text>
      </View>
      <FlashList estimatedItemSize={100}
        data={logs}
        keyExtractor={item => item.id}
        renderItem={renderLogItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No audit logs found.</Text>
          </View>
        }
      />
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
    padding: 20,
  },
  unauthorizedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 8,
  },
  unauthorizedText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  header: {
    padding: 20,
    backgroundColor: '#0f141a',
    borderBottomWidth: 4,
    borderBottomColor: '#e1c37a',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f7f6f2',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#e1c37a',
    fontWeight: '600',
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  logCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0f141a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logAction: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#e1c37a',
    backgroundColor: '#0f141a',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  logDate: {
    fontSize: 12,
    color: '#999',
  },
  logDescription: {
    fontSize: 16,
    color: '#0f141a',
    marginBottom: 12,
  },
  logFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logUser: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  }
});
