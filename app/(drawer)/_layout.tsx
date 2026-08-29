import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { DrawerContentScrollView } from 'expo-router/drawer';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { Colors, Typography, Layout } from '../../src/theme/tokens';
import { useAuth } from '../../src/context/AuthContext';
import { Avatar } from '../../src/components/ui/Avatar';
import { useInAppNotifications } from '../../src/hooks/useInAppNotifications';

// ── Nav item type ───────────────────────────────────────────────
import { isManagement, canAccessTeamAndAccess } from '../../src/utils/permissions';
import { ApprovalService } from '../../src/services/approvals/ApprovalService';
import { supabase } from '../../src/lib/supabase';

interface NavItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  badge?: string;
}

// ── Nav groups ──────────────────────────────────────────────────
const MAIN_NAV: NavItem[] = [
  { label: 'Meetings',  icon: 'calendar-outline', route: '/(drawer)/(tabs)/calendar' },
];

const MANAGEMENT_NAV: NavItem[] = [
  { label: 'Approvals',   icon: 'checkmark-circle-outline', route: '/(drawer)/(tabs)/approvals' },
  { label: 'Team',        icon: 'people-outline',           route: '/(drawer)/(tabs)/current-users' },
  { label: 'Activity',    icon: 'pulse-outline',            route: '/(drawer)/(tabs)/activity' },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Team & Access', icon: 'settings-outline', route: '/(drawer)/(tabs)/team-access' },
];

const SUPER_ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard',     icon: 'grid-outline',             route: '/(drawer)/(superadmin)/dashboard' },
  { label: 'Companies',     icon: 'business-outline',         route: '/(drawer)/(superadmin)/companies' },
  { label: 'Founders',      icon: 'person-add-outline',       route: '/(drawer)/(superadmin)/founders' },
  { label: 'Tasks',         icon: 'checkbox-outline',         route: '/(drawer)/(tabs)/tasks' },
  { label: 'Meetings',      icon: 'calendar-outline',         route: '/(drawer)/(tabs)/calendar' },
  { label: 'Reports',       icon: 'bar-chart-outline',        route: '/(drawer)/(tabs)/reports' },
  { label: 'Chat',          icon: 'chatbubbles-outline',      route: '/(drawer)/(tabs)/chat' },
  { label: 'Notes',         icon: 'document-text-outline',    route: '/(drawer)/(tabs)/notes' },
];

const OTHER_NAV: NavItem[] = [
  { label: 'Notes',       icon: 'document-text-outline', route: '/(drawer)/(tabs)/notes' },
  { label: 'Reports',     icon: 'bar-chart-outline',     route: '/(drawer)/(tabs)/reports' },
];

// ── Sidebar nav item ─────────────────────────────────────────────
function SideNavItem({
  item,
  isActive,
  onPress,
  badge,
}: {
  item: NavItem;
  isActive: boolean;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <TouchableOpacity
      style={[styles.navItem, isActive && styles.navItemActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons
        name={item.icon}
        size={18}
        color={isActive ? Colors.primary : Colors.sidebarText}
      />
      <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
        {item.label}
      </Text>
      {item.badge && (
        <View style={styles.navBadge}>
          <Text style={styles.navBadgeText}>{item.badge}</Text>
        </View>
      )}
      {badge !== undefined && badge > 0 && (
        <View style={styles.navBadge}>
          <Text style={styles.navBadgeText}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Custom Drawer Content ────────────────────────────────────────
function CustomDrawerContent(props: any) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useAuth();
  const { unreadCount } = useInAppNotifications();

  const isSuperAdmin = profile?.role === 'Super Admin';
  const userHasManagement = isManagement(profile) && !isSuperAdmin;
  const userHasAdmin = canAccessTeamAndAccess(profile) && !isSuperAdmin;
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  useEffect(() => {
    if (!profile) return;
    const fetchCount = async () => {
      const cnt = await ApprovalService.getPendingCount(profile);
      setPendingApprovalsCount(cnt);
    };
    fetchCount();

    const channel = supabase
      .channel('drawer_approvals_count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_approvals' }, fetchCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phone_change_requests' }, fetchCount)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, fetchCount)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  const navigate = (route: string) => {
    router.push(route as any);
    props.navigation.closeDrawer();
  };

  const isActive = (route: string) => {
    if (route === '/(drawer)/(tabs)' && (pathname === '/' || pathname === '/(drawer)/(tabs)' || pathname === '/(drawer)/(tabs)/index')) return true;
    return pathname.startsWith(route) && route !== '/(drawer)/(tabs)';
  };

  return (
    <View style={styles.drawer}>
      {/* ── Logo / Brand ── */}
      <View style={styles.brand}>
        <Image
          source={require('../../assets/images/icon.png')}
          style={styles.logoIcon}
          resizeMode="contain"
        />
        <Text style={styles.logoText}>
          <Text style={styles.logoZero}>Zero</Text>
          <Text style={styles.logoTask}>Task</Text>
        </Text>
      </View>

      {/* ── Navigation ── */}
      <DrawerContentScrollView
        {...props}
        scrollEnabled
        contentContainerStyle={styles.navContent}
      >
        {isSuperAdmin ? (
          <>
            <Text style={styles.sectionLabel}>PLATFORM ADMIN</Text>
            {SUPER_ADMIN_NAV.map(item => (
              <SideNavItem
                key={item.route}
                item={item}
                isActive={isActive(item.route)}
                onPress={() => navigate(item.route)}
                badge={item.label === 'Approvals' ? (pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined) : undefined}
              />
            ))}
          </>
        ) : (
          <>
            {/* Main */}
            <Text style={styles.sectionLabel}>MAIN</Text>
            {MAIN_NAV.map(item => (
              <SideNavItem
                key={item.route}
                item={item}
                isActive={isActive(item.route)}
                onPress={() => navigate(item.route)}
              />
            ))}

            {/* Management (role-gated) */}
            {userHasManagement && (
              <>
                <Text style={styles.sectionLabel}>MANAGEMENT</Text>
                {MANAGEMENT_NAV.map(item => (
                  <SideNavItem
                    key={item.route}
                    item={item}
                    isActive={isActive(item.route)}
                    onPress={() => navigate(item.route)}
                    badge={item.label === 'Approvals' ? (pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined) : undefined}
                  />
                ))}
              </>
            )}

            {/* Admin (Founder & Super Admin) */}
            {userHasAdmin && (
              <>
                <Text style={styles.sectionLabel}>ADMIN</Text>
                {ADMIN_NAV.map(item => (
                  <SideNavItem
                    key={item.route}
                    item={item}
                    isActive={isActive(item.route)}
                    onPress={() => navigate(item.route)}
                  />
                ))}
              </>
            )}

            {/* Other */}
            <Text style={styles.sectionLabel}>OTHER</Text>
            {OTHER_NAV.map(item => (
              <SideNavItem
                key={item.route}
                item={item}
                isActive={isActive(item.route)}
                onPress={() => navigate(item.route)}
              />
            ))}
          </>
        )}
      </DrawerContentScrollView>

      {/* ── User Profile ── */}
      <TouchableOpacity
        style={styles.userPanel}
        onPress={() => {
          if (isSuperAdmin) {
            navigate('/(drawer)/(superadmin)/profile');
          } else {
            navigate('/(drawer)/(tabs)/profile');
          }
        }}
        activeOpacity={0.8}
      >
        <Avatar
          name={profile?.full_name || profile?.email}
          uri={profile?.avatar_url}
          size={36}
        />
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {profile?.full_name || 'User'}
          </Text>
          <Text style={styles.userRole} numberOfLines={1}>
            {profile?.role || 'Employee'}
          </Text>
        </View>
        <Ionicons name="chevron-up" size={14} color={Colors.sidebarMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ── Drawer Layout ────────────────────────────────────────────────
export default function DrawerLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerStyle: {
            backgroundColor: Colors.sidebarBg,
            width: 260,
          },
        }}
      >
        <Drawer.Screen name="(tabs)" options={{ title: 'Home' }} />
        <Drawer.Screen name="(superadmin)" options={{ title: 'Super Admin' }} />
      </Drawer>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  drawer: {
    flex: 1,
    backgroundColor: Colors.sidebarBg,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: 56,
    paddingBottom: Layout.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  logoText: {
    fontSize: 20,
  },
  logoZero: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textInverse,
  },
  logoTask: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  navContent: {
    paddingTop: Layout.spacing.sm,
    paddingBottom: Layout.spacing.xl,
    paddingHorizontal: Layout.spacing.sm,
  },
  sectionLabel: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 10,
    color: Colors.sidebarMuted,
    letterSpacing: 1.2,
    paddingHorizontal: Layout.spacing.sm,
    marginTop: Layout.spacing.lg,
    marginBottom: Layout.spacing.xs,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.md,
    paddingVertical: Layout.spacing.sm + 2,
    paddingHorizontal: Layout.spacing.md,
    borderRadius: Layout.radius.md,
    marginVertical: 1,
  },
  navItemActive: {
    backgroundColor: Colors.sidebarActiveBg,
  },
  navLabel: {
    flex: 1,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.md,
    color: Colors.sidebarText,
  },
  navLabelActive: {
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  navBadge: {
    backgroundColor: Colors.danger,
    borderRadius: Layout.radius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  navBadgeText: {
    color: Colors.textInverse,
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
  },
  userPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.md,
    padding: Layout.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textInverse,
  },
  userRole: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.sidebarMuted,
    marginTop: 1,
  },
});
