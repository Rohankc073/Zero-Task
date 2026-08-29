import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../../src/context/AuthContext";
import { InAppNotification, useInAppNotifications } from "../../../src/hooks/useInAppNotifications";
import { ZeroTaskHeader } from "../../../src/components/ZeroTaskHeader";
import { Colors, Layout, Typography } from "../../../src/theme/tokens";

// Local time formatter
const formatDistanceToNow = (date: Date) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

type NotificationCategory =
  | "All"
  | "Self-Assigned"
  | "Deadlines"
  | "Completions"
  | "Assignments"
  | "Deletions"
  | "Approvals"
  | "Organization";

const CATEGORIES: { key: NotificationCategory; label: string; icon: string }[] =
  [
    { key: "All", label: "All", icon: "layers-outline" },
    { key: "Self-Assigned", label: "Self-Assigned", icon: "person-outline" },
    { key: "Deadlines", label: "Deadlines", icon: "calendar-outline" },
    {
      key: "Completions",
      label: "Completions",
      icon: "checkmark-circle-outline",
    },
    { key: "Assignments", label: "Assignments", icon: "clipboard-outline" },
    { key: "Deletions", label: "Deletions", icon: "trash-outline" },
    { key: "Approvals", label: "Approvals", icon: "shield-checkmark-outline" },
    { key: "Organization", label: "Organization", icon: "business-outline" },
  ];

const getStateMeta = (notification: InAppNotification) => {
  const state = (notification.entity_state || "").toUpperCase();
  const type = (notification.type || "").toUpperCase();

  if (state === "TASK_DELETED" || type.includes("DELET")) {
    return {
      category: "Deletions" as NotificationCategory,
      stateBadge: "Deleted",
      icon: "trash-outline",
      color: "#DC2626",
      bg: "#FEE2E2",
      badgeBg: "#FEF2F2",
      isDeleted: true,
    };
  }

  if (state === "TASK_COMPLETED" || type.includes("COMPLET") || type.includes("DONE")) {
    return {
      category: "Completions" as NotificationCategory,
      stateBadge: "Completed",
      icon: "checkmark-circle",
      color: "#16A34A",
      bg: "#DCFCE7",
      badgeBg: "#F0FDF4",
      isDeleted: false,
    };
  }

  if (state === "TASK_IN_PROGRESS" || type.includes("STARTED")) {
    return {
      category: "Assignments" as NotificationCategory,
      stateBadge: "In Progress",
      icon: "play-circle-outline",
      color: "#2563EB",
      bg: "#DBEAFE",
      badgeBg: "#EFF6FF",
      isDeleted: false,
    };
  }

  if (state === "TASK_DEADLINE_CHANGED" || type.includes("DEADLINE")) {
    return {
      category: "Deadlines" as NotificationCategory,
      stateBadge: "Deadline Updated",
      icon: "calendar-outline",
      color: "#D97706",
      bg: "#FEF3C7",
      badgeBg: "#FFFBEB",
      isDeleted: false,
    };
  }

  if (state === "TASK_SELF_ASSIGNED" || type.includes("SELF_ASSIGNED")) {
    return {
      category: "Self-Assigned" as NotificationCategory,
      stateBadge: "Self-Assigned",
      icon: "person-circle-outline",
      color: Colors.primary,
      bg: Colors.primaryLight,
      badgeBg: Colors.primaryLight,
      isDeleted: false,
    };
  }

  if (state === "TASK_ASSIGNED" || type.includes("ASSIGN")) {
    return {
      category: "Assignments" as NotificationCategory,
      stateBadge: "Assigned",
      icon: "clipboard-outline",
      color: "#4F46E5",
      bg: "#EEF2FF",
      badgeBg: "#EEF2FF",
      isDeleted: false,
    };
  }

  if (type.includes("APPROVAL") || type.includes("PHONE") || type.includes("PASSWORD")) {
    return {
      category: "Approvals" as NotificationCategory,
      stateBadge: "Approval",
      icon: "shield-checkmark-outline",
      color: "#7C3AED",
      bg: "#EDE9FE",
      badgeBg: "#F5F3FF",
      isDeleted: false,
    };
  }

  return {
    category: "Organization" as NotificationCategory,
    stateBadge: "Update",
    icon: "business-outline",
    color: "#64748B",
    bg: "#F1F5F9",
    badgeBg: "#F8FAFC",
    isDeleted: false,
  };
};

const DeletedTaskModal = ({
  visible,
  onClose,
  notification,
}: {
  visible: boolean;
  onClose: () => void;
  notification: InAppNotification | null;
}) => {
  if (!notification) return null;

  const metadata = notification.metadata || {};
  const taskTitle = notification.entity_title || metadata.original_title || notification.title;
  const deletedBy = metadata.deleted_by || notification.actor_name || "A supervisor/user";
  const department = notification.department_name || metadata.department || "General";
  const deletedAt = metadata.deleted_at
    ? new Date(metadata.deleted_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Recently";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.modalIconWrapper}>
              <Ionicons name="trash-outline" size={24} color="#DC2626" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.modalTitle}>Task Deleted</Text>
              <Text style={styles.modalSubtitle}>Current Entity State</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalAlertBanner}>
            <Ionicons name="information-circle" size={20} color="#DC2626" style={{ marginTop: 1 }} />
            <Text style={styles.modalAlertText}>
              This task has been permanently deleted and is no longer available in the workspace.
            </Text>
          </View>

          <View style={styles.modalDetailsCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Task Title</Text>
              <Text style={styles.detailValue} numberOfLines={2}>
                {taskTitle}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Department</Text>
              <Text style={styles.detailValue}>{department}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Deleted By</Text>
              <Text style={styles.detailValue}>{deletedBy}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Deletion Time</Text>
              <Text style={styles.detailValue}>{deletedAt}</Text>
            </View>
            <View style={[styles.detailRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
              <Text style={styles.detailLabel}>Current Status</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>DELETED</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.modalDismissBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.modalDismissBtnText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const NotificationCard = ({
  notification,
  onMarkRead,
  onDelete,
  onOpenDeletedModal,
  router,
}: {
  notification: InAppNotification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenDeletedModal: (notif: InAppNotification) => void;
  router: any;
}) => {
  const meta = getStateMeta(notification);

  // Extract department prefix if structured as "[Dept] - [Message]" or "[Dept] — [Message]"
  const rawMessage = notification.message || "";
  const parts = rawMessage.includes(" — ")
    ? rawMessage.split(" — ")
    : rawMessage.includes(" - ")
    ? rawMessage.split(" - ")
    : [rawMessage];
  const hasDeptPrefix = parts.length > 1 && parts[0].length < 30;
  const deptName = notification.department_name || (hasDeptPrefix ? parts[0] : null);
  const mainMessage = hasDeptPrefix
    ? parts.slice(1).join(" — ")
    : rawMessage;

  const timestamp = notification.updated_at || notification.created_at || new Date().toISOString();

  const handlePress = () => {
    if (!notification.is_read) onMarkRead(notification.id);

    // If deleted or no action_url on a task, open the safe entity state modal
    if (meta.isDeleted || !notification.action_url) {
      if (notification.entity_type === "TASK" || notification.task_id || meta.isDeleted) {
        onOpenDeletedModal(notification);
        return;
      }
    }

    if (notification.action_url) {
      router.push(notification.action_url as any);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.card, !notification.is_read && styles.unreadCard]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.iconAndBadge}>
          <View style={[styles.iconContainer, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon as any} size={16} color={meta.color} />
          </View>
          {deptName && (
            <View style={styles.deptBadge}>
              <Text style={styles.deptBadgeText}>{deptName}</Text>
            </View>
          )}
          <View style={[styles.statePill, { backgroundColor: meta.badgeBg, borderColor: meta.color }]}>
            <Text style={[styles.statePillText, { color: meta.color }]}>{meta.stateBadge}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {!notification.is_read && <View style={styles.unreadDot} />}
          <Text style={styles.time}>
            {formatDistanceToNow(new Date(timestamp))}
          </Text>
          <TouchableOpacity
            onPress={() => onDelete(notification.id)}
            style={{ marginLeft: 6, padding: 2 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.title, !notification.is_read && styles.unreadTitle]}>
        {notification.title}
      </Text>

      <Text style={[styles.message, notification.is_read && styles.readMessage]}>
        {mainMessage}
      </Text>

      {/* Actor & Entity metadata subline if present */}
      {notification.actor_name && (
        <View style={styles.actorRow}>
          <Ionicons name="person-circle-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.actorText}>
            {notification.actor_name}
            {notification.actor_role ? ` • ${notification.actor_role}` : ""}
          </Text>
        </View>
      )}

      {notification.action_url && !meta.isDeleted && (
        <View style={styles.actionHint}>
          <Text style={styles.actionHintText}>Tap to view task details</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
        </View>
      )}

      {meta.isDeleted && (
        <View style={[styles.actionHint, { borderTopColor: "#FEE2E2" }]}>
          <Text style={[styles.actionHintText, { color: "#DC2626" }]}>Tap to view deletion details</Text>
          <Ionicons name="information-circle-outline" size={14} color="#DC2626" />
        </View>
      )}
    </TouchableOpacity>
  );
};

export default function NotificationsScreen() {
  const {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
    refetch,
  } = useInAppNotifications();
  const { profile } = useAuth();
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] =
    useState<NotificationCategory>("All");
  const [deletedModalNotif, setDeletedModalNotif] =
    useState<InAppNotification | null>(null);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Filter notifications by category
  const filteredNotifications = useMemo(() => {
    if (selectedCategory === "All") return notifications;
    return notifications.filter((n) => {
      const meta = getStateMeta(n);
      return meta.category === selectedCategory;
    });
  }, [notifications, selectedCategory]);

  // Compute category unread count badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    notifications.forEach((n) => {
      if (!n.is_read) {
        const meta = getStateMeta(n);
        counts[meta.category] = (counts[meta.category] || 0) + 1;
        counts["All"] = (counts["All"] || 0) + 1;
      }
    });
    return counts;
  }, [notifications]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ZeroTaskHeader />
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSubtitle}>
            {profile?.role === "Founder"
              ? "Live Enterprise Activity & State Feed"
              : "Updates & Task Activity"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllAsRead} style={styles.markAllBtn}>
              <Ionicons
                name="checkmark-done-outline"
                size={16}
                color={Colors.primary}
                style={{ marginRight: 4 }}
              />
              <Text style={styles.markAllText}>Mark read</Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity
              onPress={clearAllNotifications}
              style={[styles.markAllBtn, { backgroundColor: Colors.dangerLight }]}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={Colors.danger}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.markAllText, { color: Colors.danger }]}>
                Clear all
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category Section Pills */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.key;
            const count = categoryCounts[cat.key] || 0;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[
                  styles.filterPill,
                  isSelected && styles.filterPillActive,
                ]}
                onPress={() => setSelectedCategory(cat.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={14}
                  color={isSelected ? Colors.textInverse : Colors.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.filterPillText,
                    isSelected && styles.filterPillTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
                {count > 0 && (
                  <View
                    style={[
                      styles.pillBadge,
                      isSelected && styles.pillBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillBadgeText,
                        isSelected && styles.pillBadgeTextActive,
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Notification List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : filteredNotifications.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name="notifications-off-outline"
            size={64}
            color={Colors.textSecondary}
          />
          <Text style={styles.emptyTitle}>
            {selectedCategory === "All"
              ? "You're all caught up"
              : `No ${selectedCategory} notifications`}
          </Text>
          <Text style={styles.emptyText}>
            {selectedCategory === "All"
              ? "Real-time task states, assignments, and updates will appear here."
              : "Switch to another category or check back later."}
          </Text>
        </View>
      ) : (
        <FlashList
          data={filteredNotifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationCard
              notification={item}
              onMarkRead={markAsRead}
              onDelete={deleteNotification}
              onOpenDeletedModal={(notif) => setDeletedModalNotif(notif)}
              router={router}
            />
          )}
          contentContainerStyle={styles.listContainer}
        />
      )}

      {/* Safe Deleted Task State Modal */}
      <DeletedTaskModal
        visible={!!deletedModalNotif}
        onClose={() => setDeletedModalNotif(null)}
        notification={deletedModalNotif}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Layout.spacing.lg,
    paddingVertical: Layout.spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  headerTitle: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Colors.primaryLight,
    borderRadius: Layout.radius.full,
  },
  markAllText: {
    color: Colors.primary,
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
  },
  filterSection: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    paddingVertical: 10,
  },
  filterScroll: {
    paddingHorizontal: Layout.spacing.lg,
    gap: 8,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Layout.radius.full,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterPillText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  filterPillTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.bold,
  },
  pillBadge: {
    marginLeft: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Layout.radius.full,
  },
  pillBadgeActive: {
    backgroundColor: Colors.surface,
  },
  pillBadgeText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textInverse,
  },
  pillBadgeTextActive: {
    color: Colors.primary,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Layout.spacing.xl,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emptyText: {
    color: Colors.textSecondary,
    marginTop: 6,
    fontSize: 13,
    textAlign: "center",
    maxWidth: 280,
  },
  listContainer: {
    padding: Layout.spacing.lg,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    padding: Layout.spacing.lg,
    marginBottom: Layout.spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    ...Layout.shadow.card,
  },
  unreadCard: {
    borderColor: Colors.primaryLight,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  iconAndBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  deptBadge: {
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  deptBadgeText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
  },
  statePillText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  time: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.medium,
  },
  title: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  unreadTitle: {
    color: Colors.textPrimary,
  },
  message: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 19,
    fontFamily: Typography.fontFamily.regular,
  },
  readMessage: {
    color: Colors.textSecondary,
  },
  actorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 4,
  },
  actorText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
  actionHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  actionHintText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Layout.spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.xl,
    padding: Layout.spacing.xl,
    width: "100%",
    maxWidth: 420,
    ...Layout.shadow.modal,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  modalIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalAlertBanner: {
    flexDirection: "row",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: Layout.radius.md,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  modalAlertText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: "#991B1B",
    lineHeight: 18,
  },
  modalDetailsCard: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Layout.radius.md,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
    maxWidth: "60%",
    textAlign: "right",
  },
  statusPill: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: "#DC2626",
  },
  modalDismissBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Layout.radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalDismissBtnText: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textInverse,
  },
});
