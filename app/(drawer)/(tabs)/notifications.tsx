import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useInAppNotifications, InAppNotification } from '../../../src/hooks/useInAppNotifications';
import { Ionicons } from '@expo/vector-icons';

// Local time formatter to bypass Metro bundler dependency issues
const formatDistanceToNow = (date: Date) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  return `${Math.floor(diffInSeconds / 86400)} days ago`;
};

const NotificationCard = ({ notification, onMarkRead, router }: { notification: InAppNotification, onMarkRead: (id: string) => void, router: any }) => {
  return (
    <TouchableOpacity 
      style={[styles.card, !notification.is_read && styles.unreadCard]} 
      onPress={() => {
        if (!notification.is_read) onMarkRead(notification.id);
        if (notification.action_url) {
          router.push(notification.action_url as any);
        }
      }}
      disabled={notification.is_read && !notification.action_url}
    >
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          {!notification.is_read && <View style={styles.unreadDot} />}
          <Text style={[styles.title, !notification.is_read && styles.unreadTitle]}>{notification.title}</Text>
        </View>
        <Text style={styles.time}>{formatDistanceToNow(new Date(notification.created_at))}</Text>
      </View>
      <Text style={[styles.message, notification.is_read && styles.readMessage]}>{notification.message}</Text>
    </TouchableOpacity>
  );
};

export default function NotificationsScreen() {
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead } = useInAppNotifications();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllAsRead}>
            <Text style={styles.markAllText}>Mark all as read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#e1c37a" />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={64} color="#333" />
          <Text style={styles.emptyText}>You're all caught up</Text>
        </View>
      ) : (
        <FlashList estimatedItemSize={100}
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationCard notification={item} onMarkRead={markAsRead} router={router} />
          )}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f141a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#0f141a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e252d',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f7f6f2',
  },
  markAllText: {
    color: '#e1c37a',
    fontSize: 14,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
  },
  listContainer: {
    padding: 16,
  },
  card: {
    backgroundColor: '#1e252d',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    opacity: 0.6,
  },
  unreadCard: {
    opacity: 1,
    borderColor: '#e1c37a',
    borderWidth: 1,
    backgroundColor: '#182028',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e1c37a',
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#aaa',
  },
  unreadTitle: {
    color: '#f7f6f2',
  },
  time: {
    fontSize: 12,
    color: '#666',
  },
  message: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
  readMessage: {
    color: '#888',
  },
});
