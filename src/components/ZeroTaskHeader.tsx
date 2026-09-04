import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { Colors, Typography, Layout } from '../theme/tokens';
import { useInAppNotifications } from '../hooks/useInAppNotifications';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui/Avatar';

interface ZeroTaskHeaderProps {
  onSearchPress?: () => void;
}

export const ZeroTaskHeader: React.FC<ZeroTaskHeaderProps> = ({ onSearchPress }) => {
  const navigation = useNavigation();
  const router = useRouter();
  const { unreadCount } = useInAppNotifications();
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'Super Admin';

  const handleToggleDrawer = () => {
    try {
      // 1. Search upwards through navigator hierarchy to locate the verified Drawer navigator
      let currentNav: any = navigation;
      let drawerNav: any = null;

      // Check if current navigator is itself a drawer
      const currentState = currentNav?.getState ? currentNav.getState() : null;
      if (currentState?.type === 'drawer') {
        drawerNav = currentNav;
      }

      // Traverse up parent tree until a drawer navigator is verified
      while (!drawerNav && currentNav?.getParent) {
        const parent = currentNav.getParent('drawer') || currentNav.getParent();
        if (!parent) break;

        const parentState = parent.getState ? parent.getState() : null;
        if (parentState?.type === 'drawer') {
          drawerNav = parent;
          break;
        }

        // If parent has a dispatch method and we reached the top level without finding type, check if it can handle or continue climbing
        currentNav = parent;
      }

      if (drawerNav) {
        drawerNav.dispatch({ type: 'TOGGLE_DRAWER' });
        return;
      }

      // If no drawer exists in hierarchy, navigate back safely without throwing unhandled action warnings
      if (router.canGoBack()) {
        router.back();
      }
    } catch (err) {
      console.warn('Could not toggle drawer:', err);
    }
  };

  return (
    <View style={styles.header}>
      {/* Left: Hamburger + Logo */}
      <View style={styles.left}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handleToggleDrawer}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="menu" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.brandRow}>
          <Image
            source={require('../../assets/images/icon.png')}
            style={styles.logoIcon}
            resizeMode="contain"
          />
          <Text style={styles.brandText}>
            <Text style={styles.brandZero}>Zero</Text>
            <Text style={styles.brandTask}>Task</Text>
          </Text>
        </View>
      </View>

      {/* Right: Bell + Avatar */}
      <View style={styles.right}>
        {!isSuperAdmin && (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/notifications' as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="notifications-outline" size={20} color={Colors.textSecondary} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => {
            if (isSuperAdmin) {
              router.push('/(drawer)/(superadmin)/profile' as any);
            } else {
              router.push('/(drawer)/(tabs)/profile' as any);
            }
          }}
        >
          <Avatar
            name={profile?.full_name || profile?.email}
            uri={profile?.avatar_url}
            size={32}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: 6,
    paddingBottom: 4,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    height: 58,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
  },
  brandText: {
    fontSize: 18,
    lineHeight: 22,
  },
  brandZero: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  brandTask: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.sm,
  },
  iconBtn: {
    position: 'relative',
    padding: 4,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: Colors.danger,
    borderRadius: Layout.radius.full,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  badgeText: {
    color: Colors.textInverse,
    fontSize: 9,
    fontFamily: Typography.fontFamily.bold,
  },
});
