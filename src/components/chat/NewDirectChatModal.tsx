import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Layout } from '../../theme/tokens';
import { User, Department } from '../../types';

interface NewDirectChatModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectUser: (userId: string) => Promise<void>;
}

export function NewDirectChatModal({
  visible,
  onClose,
  onSelectUser,
}: NewDirectChatModalProps) {
  const { profile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [startingChatWithId, setStartingChatWithId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !profile) return;
    if (profile.role !== 'Super Admin' && !profile.company_id) return;

    let isMounted = true;
    const fetchCompanyUsers = async () => {
      setLoading(true);
      try {
        // Fetch departments for mapping (only if not Super Admin)
        if (profile.role !== 'Super Admin' && profile.company_id) {
          const { data: deptData } = await supabase
            .from('departments')
            .select('id, name')
            .eq('company_id', profile.company_id);

          if (deptData && isMounted) {
            const dMap = deptData.reduce((acc, d) => {
              acc[d.id] = d.name;
              return acc;
            }, {} as Record<string, string>);
            setDepartments(dMap);
          }
        }

        let query = supabase
          .from('users')
          .select('id, full_name, name, email, role, department_id, designation_id, avatar_url, is_active, is_deleted, company:companies(id, name)')
          .neq('id', profile.id)
          .eq('is_active', true)
          .eq('is_deleted', false)
          .order('full_name', { ascending: true });

        if (profile.role !== 'Super Admin') {
          query = query.eq('company_id', profile.company_id).neq('role', 'Super Admin');
        }

        const { data, error } = await query;

        if (error) {
          console.error('Error fetching chat users:', error.message);
        } else if (data && isMounted) {
          setUsers(data as User[]);
        }
      } catch (err: any) {
        console.error('Error fetching chat candidates:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchCompanyUsers();

    return () => {
      isMounted = false;
    };
  }, [visible, profile?.id, profile?.company_id]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase().trim();
    return users.filter((u) => {
      const name = (u.full_name || u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const role = (u.role || '').toLowerCase();
      const deptName = (u.department_id && departments[u.department_id] ? departments[u.department_id] : '').toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q) || deptName.includes(q);
    });
  }, [users, searchQuery, departments]);

  const handleUserPress = async (userId: string) => {
    setStartingChatWithId(userId);
    try {
      await onSelectUser(userId);
      onClose();
    } catch (err: any) {
      Alert.alert('Unable to start chat', err?.message || 'Failed to start direct conversation.');
    } finally {
      setStartingChatWithId(null);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="chatbubble-ellipses" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.headerTitle}>New Private Chat</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search colleagues by name, role, department..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* User List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading colleagues...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={() => (
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>
                  {searchQuery ? 'No colleagues match your search' : 'No available colleagues'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery
                    ? 'Try searching with a different name or role'
                    : 'Add team members in Team & Access to start conversations'}
                </Text>
              </View>
            )}
            renderItem={({ item }) => {
              const displayName = item.full_name || item.name || item.email || 'Team Member';
              const initial = displayName.charAt(0).toUpperCase();
              const deptName = item.department_id ? departments[item.department_id] : null;
              const isStarting = startingChatWithId === item.id;

              return (
                <TouchableOpacity
                  style={styles.userCard}
                  onPress={() => handleUserPress(item.id)}
                  disabled={isStarting}
                  activeOpacity={0.7}
                >
                  {/* Avatar */}
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initial}</Text>
                  </View>

                  {/* Info */}
                  <View style={styles.userInfo}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    <View style={styles.metaRow}>
                      <View style={styles.roleBadge}>
                        <Text style={styles.roleBadgeText}>{item.role}</Text>
                      </View>
                      {deptName && (
                        <Text style={styles.deptText} numberOfLines={1}>
                          • {deptName}
                        </Text>
                      )}
                      {profile?.role === 'Super Admin' && (item as any).company?.name && (
                        <Text style={styles.deptText} numberOfLines={1}>
                          • {(item as any).company.name}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Action */}
                  <View style={styles.cardAction}>
                    {isStarting ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Ionicons name="chatbubble-outline" size={20} color={Colors.primary} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.lg,
    color: Colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceRaised,
    marginHorizontal: Layout.spacing.lg,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    height: 42,
  },
  searchIcon: {
    marginRight: 8,
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: 16,
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 6,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: Layout.radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginRight: 12,
  },
  avatarText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
    color: Colors.textPrimary,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  roleBadge: {
    backgroundColor: Colors.surfaceRaised,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  roleBadgeText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 11,
    color: Colors.textSecondary,
  },
  deptText: {
    marginLeft: 6,
    fontFamily: Typography.fontFamily.regular,
    fontSize: 12,
    color: Colors.textMuted,
    flexShrink: 1,
  },
  cardAction: {
    marginLeft: 8,
    padding: 4,
  },
});
