import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Keyboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { UserService } from '../../services/users/UserService';
import { Colors, Typography, Layout } from '../../theme/tokens';
import { User, Department } from '../../types';
import { useResponsive } from '../../hooks/useResponsive';
import { ZeroTaskHeader } from '../ZeroTaskHeader';

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
  const { isSmallDevice, isTablet, safeBottom } = useResponsive();
  const { profile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [startingChatWithId, setStartingChatWithId] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const CACHE_KEY = `@zerotask_colleagues_${profile?.company_id || 'all'}_${profile?.id || 'me'}`;

  // 1. Instant Cache Hydration: Load cached colleagues immediately on mount/open
  useEffect(() => {
    if (!visible) return;

    let isMounted = true;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached && isMounted) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed.users) && parsed.users.length > 0) {
            setUsers(parsed.users);
            if (parsed.departments) setDepartments(parsed.departments);
          }
        }
      } catch {
        // Cache miss
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [visible, CACHE_KEY]);

  // 2. Fetch fresh colleagues from backend with safe timeout
  const fetchCompanyUsers = useCallback(async (isPullToRefresh = false) => {
    if (!profile) return;

    // Show full-screen spinner only if no users are available in state/cache yet
    if (!isPullToRefresh && users.length === 0) {
      setLoading(true);
    }
    if (isPullToRefresh) {
      setRefreshing(true);
    }

    try {
      // 1. Primary: Use authoritative UserService
      let uResData: any[] | null = null;
      let dResData: any[] | null = null;

      let timer: any;
      try {
        const fetchPromise = Promise.all([
          UserService.getUsers(),
          UserService.getDepartments(),
        ]);
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Network timeout')), 7000);
        });

        const [uRes, dRes] = (await Promise.race([fetchPromise, timeoutPromise])) as any;
        clearTimeout(timer);
        if (uRes?.data && Array.isArray(uRes.data)) {
          uResData = uRes.data;
        }
        if (dRes?.data && Array.isArray(dRes.data)) {
          dResData = dRes.data;
        }
      } catch (err) {
        clearTimeout(timer);
        console.warn('[NewDirectChatModal] Primary fetch failed or timed out:', err);
      }

      // Build department lookup map
      let dMap: Record<string, string> = {};
      if (dResData && Array.isArray(dResData)) {
        dMap = dResData.reduce((acc: Record<string, string>, d: any) => {
          acc[d.id] = d.name;
          return acc;
        }, {} as Record<string, string>);
        setDepartments(dMap);
      }

      // If primary users succeeded
      if (uResData && Array.isArray(uResData)) {
        let candidateUsers = uResData.filter(
          (u: any) => u.id !== profile.id && u.is_active !== false && !u.is_deleted
        );
        if (profile.role !== 'Super Admin') {
          candidateUsers = candidateUsers.filter((u: any) => u.role !== 'Super Admin');
          if (profile.company_id) {
            candidateUsers = candidateUsers.filter(
              (u: any) => !u.company_id || u.company_id === profile.company_id
            );
          }
        }
        setUsers(candidateUsers as User[]);
        AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ users: candidateUsers, departments: dMap, timestamp: Date.now() })
        ).catch(() => {});
        return;
      }

      // 2. Fallback to Supabase / QueryBuilder
      let query = supabase
        .from('users')
        .select('id, full_name, name, email, role, department_id, designation_id, avatar_url, is_active, is_deleted, company:companies(id, name)')
        .neq('id', profile.id)
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (profile.role !== 'Super Admin') {
        query = query.neq('role', 'Super Admin');
        if (profile.company_id) {
          query = query.eq('company_id', profile.company_id);
        }
      }

      const { data: fallbackData } = await query;
      if (fallbackData && Array.isArray(fallbackData)) {
        const candidateUsers = fallbackData.filter(
          (u: any) => u.id !== profile.id && u.is_active !== false && !u.is_deleted
        );
        setUsers(candidateUsers as User[]);
        AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ users: candidateUsers, departments: dMap, timestamp: Date.now() })
        ).catch(() => {});
      }
    } catch (err: any) {
      console.error('[NewDirectChatModal] Error fetching chat candidates:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile, users.length, CACHE_KEY]);

  useEffect(() => {
    if (!visible || !profile) return;
    fetchCompanyUsers();
  }, [visible, profile?.id]);

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
      <View style={[
        styles.container,
        isTablet && { maxWidth: 640, width: '100%', alignSelf: 'center', height: '90%', borderRadius: 16, marginTop: 'auto', marginBottom: 'auto' }
      ]}>
        {/* ZeroTask App Header with safe-area support to guarantee visibility below notification bar */}
        <ZeroTaskHeader
          includeSafeArea
          showClose
          onClose={onClose}
          showDrawer={false}
          showNotifications={false}
          showAvatar={false}
        />

        {/* Modal Subheader with Title and Icon */}
        <View style={styles.modalSubHeader}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="chatbubble-ellipses" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.headerTitle}>New Private Chat</Text>
          </View>
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
        {loading && users.length === 0 ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading colleagues...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              isSmallDevice && { paddingHorizontal: 12 },
              { paddingBottom: (keyboardHeight > 0 ? keyboardHeight : 24) + safeBottom },
            ]}
            keyboardShouldPersistTaps="handled"
            refreshing={refreshing}
            onRefresh={() => fetchCompanyUsers(true)}
            ListEmptyComponent={() => (
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>
                  {searchQuery ? 'No colleagues match your search' : 'No available colleagues'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery
                    ? 'Try searching with a different name or role'
                    : 'No other team members were found in your organization.'}
                </Text>
                {!searchQuery && (
                  <TouchableOpacity
                    style={styles.retryBtn}
                    onPress={() => fetchCompanyUsers(false)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="refresh" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </TouchableOpacity>
                )}
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
  modalSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: 14,
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
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Layout.radius.md,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  retryBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
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
