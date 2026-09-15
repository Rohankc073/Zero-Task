import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
  StatusBar,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Layout } from '../theme/tokens';
import { useInAppNotifications } from '../hooks/useInAppNotifications';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui/Avatar';

export interface ZeroTaskHeaderProps {
  onSearchPress?: () => void;
  showBack?: boolean;
  onBackPress?: () => void;
  showDrawer?: boolean;
  showClose?: boolean;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  showNotifications?: boolean;
  showAvatar?: boolean;
  rightElement?: React.ReactNode;
  includeSafeArea?: boolean;
  style?: ViewStyle;
}

export const ZeroTaskHeader: React.FC<ZeroTaskHeaderProps> = ({
  onSearchPress,
  showBack = false,
  onBackPress,
  showDrawer = true,
  showClose = false,
  onClose,
  title,
  subtitle,
  showNotifications = true,
  showAvatar = true,
  rightElement,
  includeSafeArea = false,
  style,
}) => {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { unreadCount } = useInAppNotifications();
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'Super Admin';

  const safeTop = includeSafeArea
    ? Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0)
    : 0;

  const handleToggleDrawer = () => {
    try {
      let currentNav: any = navigation;
      let drawerNav: any = null;

      const currentState = currentNav?.getState ? currentNav.getState() : null;
      if (currentState?.type === 'drawer') {
        drawerNav = currentNav;
      }

      while (!drawerNav && currentNav?.getParent) {
        const parent = currentNav.getParent('drawer') || currentNav.getParent();
        if (!parent) break;

        const parentState = parent.getState ? parent.getState() : null;
        if (parentState?.type === 'drawer') {
          drawerNav = parent;
          break;
        }
        currentNav = parent;
      }

      if (drawerNav) {
        drawerNav.dispatch({ type: 'TOGGLE_DRAWER' });
        return;
      }

      if (router.canGoBack()) {
        router.back();
      }
    } catch (err) {
      console.warn('Could not toggle drawer:', err);
    }
  };

  const handleLeftPress = () => {
    if (onBackPress) {
      onBackPress();
      return;
    }
    if (showBack) {
      if (router.canGoBack()) {
        router.back();
      }
      return;
    }
    handleToggleDrawer();
  };

  const hasLeftButton = showBack || !!onBackPress || showDrawer;

  return (
    <View
      style={[
        styles.header,
        safeTop > 0 && {
          paddingTop: safeTop + 6,
          minHeight: 58 + safeTop,
        },
        style,
      ]}
    >
      {/* Left: Navigation Button + ZeroTask Logo + Title/Branding */}
      <View style={styles.left}>
        {hasLeftButton && (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleLeftPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showBack || onBackPress ? 'chevron-back' : 'menu'}
              size={showBack || onBackPress ? 24 : 22}
              color={Colors.textPrimary}
            />
          </TouchableOpacity>
        )}

        <View style={styles.brandRow}>
          <Image
            source={require('../../assets/images/icon.png')}
            style={styles.logoIcon}
            resizeMode="contain"
          />
          {title ? (
            <View style={styles.titleCol}>
              <Text style={styles.headerCustomTitle} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.headerCustomSubtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.brandText}>
              <Text style={styles.brandZero}>Zero</Text>
              <Text style={styles.brandTask}>Task</Text>
            </Text>
          )}
        </View>
      </View>

      {/* Right: Custom Element OR Close / Search / Bell / Avatar */}
      <View style={styles.right}>
        {rightElement ? (
          rightElement
        ) : (
          <>
            {onSearchPress && (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={onSearchPress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Ionicons name="search" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}

            {showNotifications && !isSuperAdmin && (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => router.push('/notifications' as any)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
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

            {showAvatar && (
              <TouchableOpacity
                onPress={() => {
                  if (isSuperAdmin) {
                    router.push('/(drawer)/(superadmin)/profile' as any);
                  } else {
                    router.push('/(drawer)/(tabs)/profile' as any);
                  }
                }}
                activeOpacity={0.8}
              >
                <Avatar
                  name={profile?.full_name || profile?.email}
                  uri={profile?.avatar_url}
                  size={32}
                />
              </TouchableOpacity>
            )}

            {(showClose || !!onClose) && (
              <TouchableOpacity
                style={[styles.iconBtn, styles.closeBtn]}
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
            )}
          </>
        )}
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
    paddingBottom: 6,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    minHeight: 58,
    zIndex: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Layout.spacing.sm,
    flexShrink: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  logoIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    flexShrink: 0,
  },
  titleCol: {
    justifyContent: 'center',
    flexShrink: 1,
  },
  headerCustomTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  headerCustomSubtitle: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 14,
    marginTop: 1,
  },
  brandText: {
    fontSize: 18,
    lineHeight: 22,
    flexShrink: 1,
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
    flexShrink: 0,
  },
  iconBtn: {
    position: 'relative',
    padding: 6,
    borderRadius: 8,
  },
  closeBtn: {
    marginLeft: 2,
    backgroundColor: Colors.surfaceSecondary,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
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
