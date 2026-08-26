import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useRouter } from 'expo-router';
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

  return (
    <View style={styles.header}>
      {/* Left: Hamburger + Logo */}
      <View style={styles.left}>
        <TouchableOpacity
          style={styles.iconBtn}
        onPress={() => (navigation as any).dispatch({ type: 'TOGGLE_DRAWER' })}
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

      {/* Right: Search + Bell + Avatar */}
      <View style={styles.right}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onSearchPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="search" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>

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

        <TouchableOpacity onPress={() => router.push('/profile' as any)}>
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
