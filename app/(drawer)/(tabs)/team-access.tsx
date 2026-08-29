import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TeamAccessModal } from "../../../src/components/TeamAccessModal";
import { Avatar } from "../../../src/components/ui/Avatar";
import { Button } from "../../../src/components/ui/Button";
import { ZeroTaskHeader } from "../../../src/components/ZeroTaskHeader";
import { useAuth } from "../../../src/context/AuthContext";
import { supabase } from "../../../src/lib/supabase";
import { Colors, Layout, Typography } from "../../../src/theme/tokens";
import { User } from "../../../src/types";
import {
  canAccessTeamAndAccess,
  canDeleteTargetUser,
  canEditTargetUser,
} from "../../../src/utils/permissions";


export default function TeamAccessScreen() {
  const { profile } = useAuth();
  const hasAccess = canAccessTeamAndAccess(profile);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select(
          `
          id, 
          email, 
          full_name, 
          role, 
          department_id, 
          designation_id,
          phone_number, 
          is_active, 
          is_deleted,
          avatar_url
        `,
        )
        .eq("is_deleted", false)
        .order("full_name");

      if (error) throw error;

      // Fetch departments and designations to map names
      const [deptsRes, desigsRes] = await Promise.all([
        supabase.from("departments").select("id, name"),
        supabase.from("designations").select("id, name"),
      ]);

      const depts = deptsRes.data || [];
      const desigs = desigsRes.data || [];

      const teamUsers = (data || []).filter(
        (u) => u.role !== "Founder" && u.role !== "Super Admin",
      );

      const mapped = teamUsers.map((u) => ({
        ...u,
        department_name:
          depts.find((d) => d.id === u.department_id)?.name || "Unassigned",
        designation_name:
          desigs.find((d) => d.id === u.designation_id)?.name || "Unassigned",
      }));

      setUsers(mapped as User[]);
    } catch (err: any) {
      console.error("Error fetching users:", err);
      Alert.alert("Error", "Failed to load team data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (hasAccess) {
        fetchUsers();
      }
    }, [hasAccess]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsers();
  };

  const handleAddUser = () => {
    setSelectedUser(null);
    setModalVisible(true);
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setModalVisible(true);
  };

  const handleDeleteUser = (user: User) => {
    Alert.alert(
      "Remove User",
      `Are you sure you want to remove ${user.full_name}? They will no longer be able to log in, but their historical tasks and activity will be preserved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              const { error } = await supabase.rpc("admin_delete_user", {
                p_target_user_id: user.id,
              });
              if (error) throw error;
              fetchUsers();
            } catch (err: any) {
              console.error(err);
              Alert.alert("Error", err.message || "Failed to remove user.");
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const filteredUsers = users.filter(
    (u) =>
      (u.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (!hasAccess) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.unauthorized}>
          <Ionicons name="lock-closed" size={48} color={Colors.textMuted} />
          <Text style={styles.unauthorizedText}>
            You do not have permission to view this page.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* ZeroTask App Header with Drawer Toggle, Logo, Search, Notifications & Avatar */}
      <ZeroTaskHeader />

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Team & Access</Text>
          <Text style={styles.subtitle}>Manage users, roles and access</Text>
        </View>
        <Button
          title="Add User"
          onPress={handleAddUser}
          style={styles.addButton}
        />
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                width: "100%",
                height: 100,
                backgroundColor: Colors.surfaceSecondary,
                marginBottom: Layout.spacing.md,
                borderRadius: Layout.radius.md,
              }}
            />
          ))}
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <View style={[styles.card, !item.is_active && styles.cardInactive]}>
              <View style={styles.cardHeader}>
                <View style={styles.userInfo}>
                  <Avatar
                    name={item.full_name || item.email}
                    uri={item.avatar_url}
                    size={40}
                  />
                  <View style={styles.userText}>
                    <Text style={styles.userName}>{item.full_name}</Text>
                    <Text style={styles.userEmail}>{item.email}</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    !item.is_active && styles.statusBadgeInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      !item.is_active && styles.statusTextInactive,
                    ]}
                  >
                    {item.is_active ? "Active" : "Inactive"}
                  </Text>
                </View>
              </View>

              <View style={styles.cardDetails}>
                <View style={styles.detailItem}>
                  <Ionicons
                    name="briefcase-outline"
                    size={14}
                    color={Colors.textSecondary}
                  />
                  <Text style={styles.detailText}>
                    {(item as any).designation_name}
                  </Text>
                  <Text style={styles.systemRoleText}>[Auth: {item.role}]</Text>
                </View>
                <View style={styles.detailItem}>
                  <Ionicons
                    name="business-outline"
                    size={14}
                    color={Colors.textSecondary}
                  />
                  <Text style={styles.detailText}>
                    {(item as any).department_name}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Ionicons
                    name="call-outline"
                    size={14}
                    color={Colors.textSecondary}
                  />
                  <Text style={styles.detailText}>
                    {item.phone_number || "No phone"}
                  </Text>
                </View>
              </View>

              <View style={styles.cardActions}>
                {canEditTargetUser(profile, item) ? (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleEditUser(item)}
                  >
                    <Ionicons
                      name="pencil-outline"
                      size={16}
                      color={Colors.primary}
                    />
                    <Text style={styles.actionText}>Edit</Text>
                  </TouchableOpacity>
                ) : item.role === "Founder" ? (
                  <View style={[styles.actionBtn, { opacity: 0.7 }]}>
                    <Ionicons
                      name="shield-checkmark"
                      size={16}
                      color={Colors.textMuted}
                    />
                    <Text
                      style={[styles.actionText, { color: Colors.textMuted }]}
                    >
                      Protected Authority
                    </Text>
                  </View>
                ) : null}

                {canDeleteTargetUser(profile, item) ? (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleDeleteUser(item)}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color={Colors.danger}
                    />
                    <Text style={[styles.actionText, { color: Colors.danger }]}>
                      Remove
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name="people-outline"
                size={48}
                color={Colors.borderDefault}
              />
              <Text style={styles.emptyText}>No users found.</Text>
            </View>
          }
        />
      )}

      <TeamAccessModal
        visible={modalVisible}
        userToEdit={selectedUser}
        onClose={() => setModalVisible(false)}
        onSuccess={() => {
          fetchUsers();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  unauthorized: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Layout.spacing.xl,
  },
  unauthorizedText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
    marginTop: Layout.spacing.md,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Layout.spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDefault,
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xl,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  addButton: {
    paddingHorizontal: Layout.spacing.md,
  },
  loadingContainer: {
    padding: Layout.spacing.lg,
  },
  listContainer: {
    padding: Layout.spacing.lg,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    padding: Layout.spacing.lg,
    marginBottom: Layout.spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderDefault,
    ...Layout.shadow.card,
  },
  cardInactive: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Layout.spacing.md,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Layout.spacing.md,
    flex: 1,
  },
  userText: {
    flex: 1,
  },
  userName: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.base,
    color: Colors.textPrimary,
  },
  userEmail: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  statusBadge: {
    backgroundColor: Colors.success + "20",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Layout.radius.full,
  },
  statusBadgeInactive: {
    backgroundColor: Colors.borderDefault,
  },
  statusText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 10,
    color: Colors.success,
    textTransform: "uppercase",
  },
  statusTextInactive: {
    color: Colors.textSecondary,
  },
  cardDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Layout.spacing.md,
    backgroundColor: Colors.background,
    padding: Layout.spacing.md,
    borderRadius: Layout.radius.md,
    marginBottom: Layout.spacing.md,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  systemRoleText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    color: Colors.textMuted,
    marginLeft: 4,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Layout.spacing.lg,
    paddingTop: Layout.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderDefault,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  actionText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: Layout.spacing.xxl,
    marginTop: 40,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginTop: Layout.spacing.md,
  },
});