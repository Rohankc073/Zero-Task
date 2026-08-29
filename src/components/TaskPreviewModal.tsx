import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import {
  Send
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { isFounder, isSuperAdmin, isExecutiveOrAdmin, isManagement, canManageTask, canDeleteTask } from "../utils/permissions";
import { TaskSegregationService } from "../services/tasks/TaskSegregationService";
import { TaskService } from "../services/tasks/TaskService";
import { Colors, Layout, Typography } from "../theme/tokens";
import { ActivityComment, ExecutionActivity, Task, TaskFile } from "../types";
import {
  deleteStorageAttachment,
  formatFileSize,
  processAndUploadAttachment,
  SUPPORTED_DOCUMENT_MIME_TYPES,
  validateAttachment
} from "../utils/attachmentPipeline";
import { TaskSegregationModal } from "./TaskSegregationModal";
import { Avatar } from "./ui/Avatar";
import VoiceNotePlayer from "./VoiceNotePlayer";

interface TaskPreviewModalProps {
  taskId: string | null;
  visible: boolean;
  onClose: () => void;
  onTaskUpdated?: (updatedTask: any) => void;
}

const TaskPreviewModal = React.memo(
  ({ taskId, visible, onClose, onTaskUpdated }: TaskPreviewModalProps) => {
    const { profile } = useAuth();
    const [currentTaskId, setCurrentTaskId] = useState<string | null>(taskId);
    const [task, setTask] = useState<any>(null);
    const [subtasks, setSubtasks] = useState<Task[]>([]);
    const [showSegregationModal, setShowSegregationModal] = useState(false);
    const [comments, setComments] = useState<ActivityComment[]>([]);
    const [files, setFiles] = useState<TaskFile[]>([]);
    const [timeline, setTimeline] = useState<ExecutionActivity[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<"Activity" | "Attachments">(
      "Activity",
    );

    // Comment state
    const [newComment, setNewComment] = useState("");
    const [postingComment, setPostingComment] = useState(false);

    // Date picker state
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [updatingDate, setUpdatingDate] = useState(false);

    // File upload state
    const [uploadingFile, setUploadingFile] = useState(false);

    // Edit Assignees state
    const [showEditAssignees, setShowEditAssignees] = useState(false);
    const [assigneePool, setAssigneePool] = useState<any[]>([]);
    const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>(
      [],
    );
    const [savingAssignees, setSavingAssignees] = useState(false);
    const [sendingReminder, setSendingReminder] = useState(false);

    useEffect(() => {
      setCurrentTaskId(taskId);
    }, [taskId]);

    useEffect(() => {
      if (visible && currentTaskId) {
        fetchTaskData(currentTaskId);
      } else {
        // Reset state on close
        setTask(null);
        setComments([]);
        setFiles([]);
        setSubtasks([]);
        setActiveTab("Activity");
      }
    }, [visible, currentTaskId]);

    const fetchTaskData = async (idToFetch = currentTaskId) => {
      if (!idToFetch) return;
      setLoading(true);

      // Fetch task via Service
      const taskData = await TaskService.getTaskWithHierarchy(idToFetch);
      if (taskData) {
        if (taskData.status === "To Do") {
          const { error } = await supabase
            .from("tasks")
            .update({ status: "In Progress" })
            .eq("id", idToFetch);
          if (!error) {
            taskData.status = "In Progress";
          }
        }
        setTask(taskData);
      }

      // Fetch child subtasks
      const subtasksData = await TaskSegregationService.getSubtasks(idToFetch);
      setSubtasks(subtasksData);

      // Fetch Timeline
      const timelineData = await TaskService.getTaskActivity(idToFetch);
      setTimeline(timelineData);

      // Fetch comments
      const { data: commentsData, error: commentsError } = await supabase
        .from("activity_comments")
        .select("*")
        .eq("task_id", idToFetch)
        .order("created_at", { ascending: true });

      if (commentsError) {
        console.error("Error fetching comments:", commentsError);
      }
      if (commentsData) {
        // Fetch users for comments manually
        const userIds = [
          ...new Set(commentsData.map((c) => c.user_id).filter(Boolean)),
        ];
        if (userIds.length > 0) {
          const { data: usersData } = await supabase
            .from("users")
            .select("id, full_name")
            .in("id", userIds);

          if (usersData) {
            const userMap = usersData.reduce((acc, user) => {
              acc[user.id] = user;
              return acc;
            }, {} as any);

            commentsData.forEach((c: any) => {
              c.user = userMap[c.user_id];
            });
          }
        }
        setComments(commentsData as any);
      }

      // Fetch files with uploader details
      const { data: filesData, error: filesError } = await supabase
        .from("task_files")
        .select("*, user:users(id, full_name, role)")
        .eq("task_id", idToFetch)
        .order("created_at", { ascending: false });

      if (filesError) {
        console.error("Error fetching files:", filesError);
      }
      if (filesData) setFiles(filesData as any);

      setLoading(false);
    };

    const handleUpdateDeadline = async (event: any, selectedDate?: Date) => {
      setShowDatePicker(Platform.OS === "ios");

      // Decouple viewing from editing: only mutate on explicit 'set' event
      if (event?.type === "dismissed") {
        return;
      }

      // Support for both (event, date) and (event) with timestamp signatures
      const timestamp = event?.nativeEvent?.timestamp;
      const finalDate =
        selectedDate || (timestamp ? new Date(timestamp) : undefined);

      if (!finalDate || !taskId) return;

      if (task?.status === "Done") {
        Alert.alert(
          "Task Completed",
          "This task has been completed and its deadline cannot be changed."
        );
        return;
      }

      const isExecAdmin = isExecutiveOrAdmin(profile);
      const isCreator = task.created_by === profile?.id;

      // Executive Admins (Founder & Super Admin) have authority to modify task deadlines
      if (!isExecAdmin) {
        if (profile?.role === "Employee" && !isCreator) {
          Alert.alert(
            "Permission Denied",
            "Employees cannot modify task deadlines.",
          );
          return;
        }

        if (isCreator && task.initial_deadline_set) {
          Alert.alert(
            "Permission Denied",
            "Creator cannot modify the deadline once it is set.",
          );
          return;
        }
      }

      setUpdatingDate(true);
      const { error } = await supabase
        .from("tasks")
        .update({ due_date: finalDate.toISOString() })
        .eq("id", taskId);

      if (error) {
        Alert.alert("Update Failed", error.message);
      } else {
        setTask((prev: any) => ({
          ...prev,
          due_date: finalDate.toISOString(),
          initial_deadline_set: true,
        }));
      }
      setUpdatingDate(false);
    };

    const handleUpdateProgress = async (pct: number) => {
      if (!taskId || !task) return;

      // Assignees, Creators, or Executive Admins can update progress
      const isAssignee = task.assignees?.some(
        (a: any) => a.user?.id === profile?.id,
      );
      const isCreator = task.created_by === profile?.id;
      const isExecAdmin = isExecutiveOrAdmin(profile);
      if (!isAssignee && !isCreator && !isExecAdmin) {
        Alert.alert(
          "Permission Denied",
          "You must be an assignee or administrator to update progress.",
        );
        return;
      }

      const newStatus = pct === 100 ? "Done" : "In Progress";
      const completedAt = pct === 100 ? new Date().toISOString() : null;

      setTask((prev: any) => ({
        ...prev,
        progress: pct,
        status: newStatus,
        completed_at: completedAt,
      }));
      onTaskUpdated?.({
        id: taskId,
        progress: pct,
        status: newStatus,
        completed_at: completedAt,
      });

      const { error } = await supabase
        .from("tasks")
        .update({ progress: pct, status: newStatus, completed_at: completedAt })
        .eq("id", taskId);

      if (error) {
        Alert.alert("Update Failed", error.message);
      }
    };

    const handleMarkCompleted = () => {
      if (!taskId || !task) return;

      const isAssignee = task.assignees?.some(
        (a: any) => a.user?.id === profile?.id,
      ) || task.user_id === profile?.id;
      const isCreator = task.created_by === profile?.id;
      const hasMgmtAuthority = isManagement(profile);

      if (!isAssignee && !isCreator && !hasMgmtAuthority) {
        Alert.alert(
          "Permission Denied",
          "You do not have permission to complete this task.",
        );
        return;
      }

      Alert.alert(
        "Mark this task as completed?",
        "Once marked as completed, the task cannot be reverted.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Mark as Completed",
            onPress: () => handleUpdateProgress(100),
          },
        ]
      );
    };

    const handleSendReminder = async () => {
      if (!taskId) return;
      setSendingReminder(true);
      try {
        const { data, error } = await supabase.rpc("send_overdue_reminder", {
          p_task_id: taskId,
        });
        if (error) throw error;
        Alert.alert(
          "Reminder Sent",
          data?.message || "Overdue reminder sent successfully.",
        );
      } catch (err: any) {
        console.error("Error sending reminder:", err);
        Alert.alert("Error", err.message || "Failed to send reminder.");
      } finally {
        setSendingReminder(false);
      }
    };

    const canEditAssignees =
      isExecutiveOrAdmin(profile) ||
      (task?.created_by === profile?.id && profile?.role !== "Employee");

    const openEditAssignees = async () => {
      if (!canEditAssignees || !profile?.id) return;
      try {
        const currentIds = (task?.assignees || [])
          .map((a: any) => a.user?.id)
          .filter(Boolean);
        setSelectedAssigneeIds(currentIds);

        let query = supabase
          .from("users")
          .select("id, full_name, role, department:departments(id, name)")
          .eq("is_approved", true)
          .neq("role", "Founder"); // Founder accounts cannot be assigned tasks

        if (profile.id) {
          query = query.neq("id", profile.id); // Cannot assign self
        }

        if (profile.role === "Manager") {
          query = query.neq("role", "Department Head");
        }

        const { data, error } = await query.order("full_name");
        if (error) throw error;

        const currentUserId = profile.id;
        const authUserId = (await supabase.auth.getUser()).data?.user?.id;
        const filtered = (data || []).filter(
          (u) =>
            u.role !== "Founder" &&
            u.id !== currentUserId &&
            u.id !== authUserId,
        );

        setAssigneePool(filtered);
        setShowEditAssignees(true);
      } catch (err: any) {
        console.error("Error fetching assignees for editing:", err);
        Alert.alert("Error", "Failed to load assignees list.");
      }
    };

    const handleSaveAssignees = async () => {
      if (selectedAssigneeIds.length === 0) {
        Alert.alert(
          "Validation Error",
          "A task must have at least one assignee.",
        );
        return;
      }
      if (!taskId) return;

      try {
        setSavingAssignees(true);
        const currentIds: string[] = (task?.assignees || [])
          .map((a: any) => a.user?.id)
          .filter(Boolean);

        const toAdd = selectedAssigneeIds.filter(
          (id: string) => !currentIds.includes(id),
        );
        const toRemove = currentIds.filter(
          (id: string) => !selectedAssigneeIds.includes(id),
        );

        if (toAdd.length > 0) {
          const payload = toAdd.map((uid) => ({
            task_id: taskId,
            user_id: uid,
          }));
          const { error: addErr } = await supabase
            .from("task_assignees")
            .insert(payload);
          if (addErr) throw addErr;
        }

        if (toRemove.length > 0) {
          const { error: remErr } = await supabase
            .from("task_assignees")
            .delete()
            .eq("task_id", taskId)
            .in("user_id", toRemove);
          if (remErr) throw remErr;
        }

        await fetchTaskData();
        setShowEditAssignees(false);
        Alert.alert("Success", "Assignees updated successfully.");
      } catch (err: any) {
        console.error("Error updating assignees:", err);
        Alert.alert(
          "Update Failed",
          err.message || "Could not update assignees.",
        );
      } finally {
        setSavingAssignees(false);
      }
    };

    const handleClaimTask = async () => {
      if (!taskId || !profile?.id) return;
      try {
        const { error } = await supabase
          .from("task_assignees")
          .insert({ task_id: taskId, user_id: profile.id });
        if (error) throw error;
        await fetchTaskData();
        Alert.alert("Success", "You have claimed this task.");
      } catch (err: any) {
        console.error("Error claiming task:", err);
        Alert.alert("Claim Failed", err.message || "Could not claim task.");
      }
    };

    const groupedAssigneePool = useMemo(() => {
      if (!assigneePool.length) return [];

      const myDeptId = profile?.department_id;
      const isExecAdmin = isExecutiveOrAdmin(profile);

      if (isExecAdmin) {
        const groups: { [key: string]: any[] } = {};
        assigneePool.forEach((u) => {
          const deptName = u.department?.name || "General";
          if (!groups[deptName]) groups[deptName] = [];
          groups[deptName].push(u);
        });
        return Object.keys(groups)
          .sort()
          .map((dept) => ({
            sectionTitle: dept,
            users: groups[dept].sort((a, b) =>
              (a.full_name || "Unnamed User").localeCompare(
                b.full_name || "Unnamed User",
              ),
            ),
          }));
      }

      const yourDeptUsers: any[] = [];
      const otherDeptUsers: any[] = [];

      assigneePool.forEach((u) => {
        if (myDeptId && u.department?.id === myDeptId) {
          yourDeptUsers.push(u);
        } else {
          otherDeptUsers.push(u);
        }
      });

      const roleRank: Record<string, number> = {
        "Department Head": 1,
        Manager: 2,
        Employee: 3,
      };
      const sortFn = (a: any, b: any) => {
        const rankA = roleRank[a.role] || 99;
        const rankB = roleRank[b.role] || 99;
        if (rankA !== rankB) return rankA - rankB;
        return (a.full_name || "Unnamed User").localeCompare(
          b.full_name || "Unnamed User",
        );
      };

      yourDeptUsers.sort(sortFn);
      otherDeptUsers.sort(sortFn);

      const result = [];
      if (yourDeptUsers.length > 0) {
        result.push({ sectionTitle: "Your Department", users: yourDeptUsers });
      }
      if (otherDeptUsers.length > 0) {
        result.push({
          sectionTitle: "Other Departments",
          users: otherDeptUsers,
        });
      }

      return result;
    }, [assigneePool, profile]);

    const handlePostComment = async () => {
      if (!newComment.trim() || !taskId || !profile?.id) return;
      setPostingComment(true);

      const { data, error } = await supabase
        .from("activity_comments")
        .insert({
          task_id: taskId,
          user_id: profile.id,
          content: newComment.trim(),
        })
        .select("*")
        .single();

      if (!error && data) {
        const newCommentData = {
          ...data,
          user: { full_name: profile.full_name || profile.name || "You" },
        };
        setComments((prev) => [...prev, newCommentData as any]);
        setNewComment("");
      } else {
        Alert.alert("Error", "Failed to post comment.");
      }

      setPostingComment(false);
    };

    const totalAttachmentBytes = useMemo(() => {
      return files.reduce((sum, f) => sum + (f.file_size || 0), 0);
    }, [files]);

    const getFileIcon = (fileType: string, fileName?: string) => {
      const ext = (
        fileType ||
        (fileName ? fileName.split(".").pop() : "") ||
        ""
      ).toLowerCase();
      if (ext === "pdf")
        return <Ionicons name="document-text" size={24} color="#DC2626" />;
      if (["doc", "docx"].includes(ext))
        return (
          <Ionicons name="document-text-outline" size={24} color="#2563EB" />
        );
      if (["xls", "xlsx", "csv"].includes(ext))
        return <Ionicons name="grid-outline" size={24} color="#16A34A" />;
      if (["ppt", "pptx"].includes(ext))
        return <Ionicons name="easel-outline" size={24} color="#EA580C" />;
      if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext))
        return <Ionicons name="image-outline" size={24} color="#0284C7" />;
      if (ext === "zip")
        return <Ionicons name="archive-outline" size={24} color="#7C3AED" />;
      return <Ionicons name="document-outline" size={24} color="#64748B" />;
    };

    const handleFileUpload = async () => {
      if (!taskId || !profile?.id) return;

      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: SUPPORTED_DOCUMENT_MIME_TYPES,
          copyToCacheDirectory: true,
          multiple: true,
        });

        if (result.canceled || !result.assets || result.assets.length === 0)
          return;

        let runningTotal = totalAttachmentBytes;
        for (const file of result.assets) {
          const validation = validateAttachment(
            { name: file.name, size: file.size, mimeType: file.mimeType },
            runningTotal,
          );
          if (!validation.valid) {
            Alert.alert("Validation Error", validation.error || "Invalid file");
            return;
          }
          runningTotal += file.size || 0;
        }

        setUploadingFile(true);
        const newUploadedFiles: TaskFile[] = [];

        for (let i = 0; i < result.assets.length; i++) {
          const file = result.assets[i];
          try {
            const resultData = await processAndUploadAttachment(
              file.uri,
              file.name,
              file.mimeType || "application/octet-stream",
              "task_attachments",
              profile.id,
              0,
              file.size,
            );

            const { data: fileRecord, error: dbError } = await supabase
              .from("task_files")
              .insert({
                task_id: taskId,
                user_id: profile.id,
                file_name: resultData.name,
                file_url: resultData.url,
                file_type: resultData.type,
                file_size: resultData.size,
                mime_type: resultData.mimeType,
                storage_path: resultData.storagePath,
              })
              .select("*, user:users(id, full_name, role)")
              .single();

            if (dbError) throw dbError;
            if (fileRecord) newUploadedFiles.push(fileRecord as any);
          } catch (uploadErr: any) {
            console.error(`Failed to upload ${file.name}:`, uploadErr);
            Alert.alert(
              "Upload Warning",
              `Could not upload ${file.name}: ${uploadErr.message}`,
            );
          }
        }

        if (newUploadedFiles.length > 0) {
          setFiles((prev) => [...newUploadedFiles, ...prev]);
        }
      } catch (error: any) {
        Alert.alert(
          "Upload Failed",
          error.message || "An error occurred while uploading.",
        );
      } finally {
        setUploadingFile(false);
      }
    };

    const handleDeleteFile = (fileId: string) => {
      const fileToDelete = files.find((f) => f.id === fileId);
      Alert.alert(
        "Delete Attachment",
        `Are you sure you want to delete "${fileToDelete?.file_name || "this attachment"}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                if (fileToDelete?.storage_path || fileToDelete?.file_url) {
                  await deleteStorageAttachment(
                    fileToDelete.storage_path || fileToDelete.file_url,
                  );
                }
                const { error } = await supabase
                  .from("task_files")
                  .delete()
                  .eq("id", fileId);
                if (error) throw error;
                setFiles((prev) => prev.filter((f) => f.id !== fileId));
              } catch (err: any) {
                Alert.alert("Error", err.message || "Could not delete file.");
              }
            },
          },
        ],
      );
    };

    const handleDeleteTask = () => {
      if (!task || !canDeleteTask(profile, task)) {
        Alert.alert("Unauthorized", "Only the task creator or founder can delete this task.");
        return;
      }

      Alert.alert(
        "Delete task?",
        "This will permanently delete the task and its attachments.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              setLoading(true);
              try {
                // 1. Fetch attachments
                const { data: attachments } = await supabase
                  .from("task_files")
                  .select("file_url")
                  .eq("task_id", taskId);

                if (attachments && attachments.length > 0) {
                  // Extract file paths from URLs
                  const paths = attachments
                    .map((a) => {
                      const urlParts = a.file_url.split("/task_attachments/");
                      return urlParts.length > 1 ? urlParts[1] : null;
                    })
                    .filter(Boolean) as string[];

                  if (paths.length > 0) {
                    // 2. Delete from storage
                    await supabase.storage
                      .from("task_attachments")
                      .remove(paths);
                  }
                }

                // 3. Delete task (cascade deletes task_files and activity_comments in DB)
                const { error } = await supabase
                  .from("tasks")
                  .delete()
                  .eq("id", taskId);

                if (error) throw error;

                onClose();
              } catch (err: any) {
                Alert.alert("Delete Failed", err.message);
              } finally {
                setLoading(false);
              }
            },
          },
        ],
      );
    };

    const getPriorityBgColor = (priority: string) => {
      switch (priority) {
        case "Urgent":
          return Colors.priorityUrgentBg;
        case "High":
          return Colors.priorityHighBg;
        case "Medium":
          return Colors.priorityMedBg;
        default:
          return Colors.priorityLowBg;
      }
    };

    const getPriorityTextColor = (priority: string) => {
      switch (priority) {
        case "Urgent":
          return Colors.priorityUrgentText;
        case "High":
          return Colors.priorityHighText;
        case "Medium":
          return Colors.priorityMedText;
        default:
          return Colors.priorityLowText;
      }
    };

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Task Detail</Text>
            <View style={styles.headerActions}>
              {task && canDeleteTask(profile, task) && (
                <TouchableOpacity
                  onPress={handleDeleteTask}
                  style={{ marginRight: 24 }}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>

          {loading && !task ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.textPrimary} />
            </View>
          ) : task ? (
            <>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.taskInfoContainer}>
                  {/* Part of Parent Task Banner */}
                  {(task.parent_task_id || task.parent) && (
                    <TouchableOpacity
                      style={styles.parentBanner}
                      onPress={() => {
                        const parentId = task.parent_task_id || task.parent?.id;
                        if (parentId) setCurrentTaskId(parentId);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="git-branch-outline"
                        size={16}
                        color={Colors.primary}
                      />
                      <Text style={styles.parentBannerText} numberOfLines={1}>
                        Part of:{" "}
                        <Text style={styles.parentBannerTitle}>
                          {task.parent?.title || "Parent Task"}
                        </Text>
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={Colors.primary}
                        style={{ marginLeft: "auto" }}
                      />
                    </TouchableOpacity>
                  )}

                  {/* Overdue Alert Card */}
                  {(() => {
                    const isDone =
                      task.status === "Done" || task.status === "Completed";
                    const now = new Date();
                    const dueDate = task.due_date
                      ? new Date(task.due_date)
                      : null;
                    const isOverdue = !!(dueDate && dueDate < now && !isDone);
                    const daysOverdue =
                      dueDate && isOverdue
                        ? Math.max(
                            1,
                            Math.ceil(
                              (now.getTime() - dueDate.getTime()) /
                                (1000 * 60 * 60 * 24),
                            ),
                          )
                        : 0;

                    if (!isOverdue) return null;

                    const canSendReminder = isManagement(profile);

                    return (
                      <View style={styles.overdueAlertBanner}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-start",
                            gap: 10,
                          }}
                        >
                          <Ionicons
                            name="alert-circle"
                            size={24}
                            color={Colors.danger}
                            style={{ marginTop: 2 }}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.overdueAlertTitle}>
                              TASK IS OVERDUE
                            </Text>
                            <Text style={styles.overdueAlertDesc}>
                              {daysOverdue === 1
                                ? "1 day overdue"
                                : `${daysOverdue} days overdue`}{" "}
                              · Deadline was{" "}
                              {dueDate?.toLocaleDateString("en-US", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </Text>
                          </View>
                        </View>
                        {canSendReminder && (
                          <TouchableOpacity
                            style={styles.sendReminderBtn}
                            onPress={handleSendReminder}
                            disabled={sendingReminder}
                            activeOpacity={0.8}
                          >
                            {sendingReminder ? (
                              <ActivityIndicator
                                size="small"
                                color={Colors.textInverse}
                              />
                            ) : (
                              <>
                                <Ionicons
                                  name="notifications-outline"
                                  size={16}
                                  color={Colors.textInverse}
                                  style={{ marginRight: 6 }}
                                />
                                <Text style={styles.sendReminderBtnText}>
                                  Send Reminder
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })()}

                  {/* Title */}
                  <Text style={styles.taskTitle}>{task.title}</Text>

                  {/* Properties List (Notion style) */}
                  <View style={{ marginBottom: Layout.spacing.lg }}>
                    {profile?.role === 'Super Admin' && (
                      <View style={styles.propertyRow}>
                        <Text style={styles.propertyLabel}>Company</Text>
                        <View style={styles.statusBadge}>
                          <Text style={[styles.statusText, { color: Colors.primary }]}>{task.company?.name || 'Global'}</Text>
                        </View>
                      </View>
                    )}

                    {/* Status */}
                    <View style={styles.propertyRow}>
                      <Text style={styles.propertyLabel}>Status</Text>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusText}>{task.status}</Text>
                      </View>
                    </View>

                    {/* Priority */}
                    <View style={styles.propertyRow}>
                      <Text style={styles.propertyLabel}>Priority</Text>
                      <View
                        style={[
                          styles.priorityBadge,
                          {
                            backgroundColor: getPriorityBgColor(task.priority),
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.priorityText,
                            { color: getPriorityTextColor(task.priority) },
                          ]}
                        >
                          {task.priority}
                        </Text>
                      </View>
                    </View>

                    {/* Progress */}
                    {!(
                      task.status === "Done" || task.status === "Completed"
                    ) && (
                      <View
                        style={[
                          styles.propertyRow,
                          { alignItems: "flex-start" },
                        ]}
                      >
                        <Text style={styles.propertyLabel}>Progress</Text>
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            flex: 1,
                            gap: 8,
                          }}
                        >
                          {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(
                            (pct) => (
                              <TouchableOpacity
                                key={pct}
                                style={[
                                  styles.progressChip,
                                  task.progress === pct &&
                                    styles.progressChipActive,
                                ]}
                                onPress={() => handleUpdateProgress(pct)}
                              >
                                <Text
                                  style={[
                                    styles.progressChipText,
                                    task.progress === pct &&
                                      styles.progressChipTextActive,
                                  ]}
                                >
                                  {pct}%
                                </Text>
                              </TouchableOpacity>
                            ),
                          )}
                        </View>
                      </View>
                    )}

                    {/* Assignees */}
                    <View
                      style={[styles.propertyRow, { alignItems: "flex-start" }]}
                    >
                      <Text style={styles.propertyLabel}>Assignees</Text>
                      <View
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                        }}
                      >
                        <View style={{ flex: 1, marginRight: 8 }}>
                          {task.assignees && task.assignees.length > 0 ? (
                            task.assignees.map((a: any) => (
                              <View
                                key={a.user?.id}
                                style={{ marginBottom: 6 }}
                              >
                                <Text
                                  style={[
                                    styles.propertyValue,
                                    {
                                      fontFamily:
                                        Typography.fontFamily.semiBold,
                                    },
                                  ]}
                                >
                                  {a.user?.full_name || "Unnamed User"}
                                </Text>
                                <Text style={styles.assigneeSubtitle}>
                                  {a.user?.role || "Member"} · {a.user?.department?.name || "General"}
                                  {profile?.role === 'Super Admin' && a.user?.company?.name ? ` · ${a.user.company.name}` : ''}
                                </Text>
                              </View>
                            ))
                          ) : (
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                              }}
                            >
                              <Text style={styles.propertyValue}>
                                Unassigned
                              </Text>
                              {profile?.role === "Employee" &&
                                !(
                                  task.status === "Done" ||
                                  task.status === "Completed"
                                ) && (
                                  <TouchableOpacity
                                    onPress={handleClaimTask}
                                    style={[
                                      styles.editBadge,
                                      {
                                        marginLeft: 12,
                                        backgroundColor: Colors.primary,
                                        borderColor: Colors.primary,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.editBadgeText,
                                        { color: Colors.textInverse },
                                      ]}
                                    >
                                      Claim Task
                                    </Text>
                                  </TouchableOpacity>
                                )}
                            </View>
                          )}
                        </View>
                        {canEditAssignees &&
                          !(
                            task.status === "Done" ||
                            task.status === "Completed"
                          ) && (
                            <TouchableOpacity
                              onPress={openEditAssignees}
                              style={styles.editBadge}
                            >
                              <Text style={styles.editBadgeText}>Edit</Text>
                            </TouchableOpacity>
                          )}
                      </View>
                    </View>

                    {/* Creator */}
                    <View style={styles.propertyRow}>
                      <Text style={styles.propertyLabel}>Created By</Text>
                      <Text style={styles.propertyValue}>
                        {task.creator?.full_name
                          ? `${task.creator.full_name} (${task.creator.role || "Unknown"})`
                          : "Unknown"}
                      </Text>
                    </View>

                    {/* Created At */}
                    <View style={styles.propertyRow}>
                      <Text style={styles.propertyLabel}>Created</Text>
                      <Text style={styles.propertyValue}>
                        {task.created_at
                          ? new Date(task.created_at).toLocaleString([], {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "Unknown"}
                      </Text>
                    </View>

                    {/* Completed At */}
                    {(task.status === "Done" || task.status === "Completed") && (
                      <View style={styles.propertyRow}>
                        <Text style={styles.propertyLabel}>Completed</Text>
                        <Text style={styles.propertyValue}>
                          {task.completed_at
                            ? new Date(task.completed_at).toLocaleString([], {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "Unknown"}
                        </Text>
                      </View>
                    )}

                    {/* Due Date */}
                    <View style={styles.propertyRow}>
                      <Text style={styles.propertyLabel}>Due Date</Text>
                      <TouchableOpacity
                        onPress={() => {
                          if (task.status === "Done" || task.status === "Completed") {
                            Alert.alert("Task Completed", "The deadline cannot be changed for a completed task.");
                            return;
                          }
                          if (
                            isManagement(profile) ||
                            (task.created_by === profile?.id && !task.initial_deadline_set)
                          ) {
                            setShowDatePicker(true);
                          }
                        }}
                        disabled={updatingDate}
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <Text
                          style={[
                            styles.propertyValue,
                            (isManagement(profile) ||
                              (task.created_by === profile?.id &&
                                !task.initial_deadline_set)) && {
                              textDecorationLine: "underline",
                            },
                          ]}
                        >
                          {task.due_date
                            ? new Date(task.due_date).toLocaleDateString()
                            : "Empty"}
                        </Text>
                      </TouchableOpacity>
                      {showDatePicker && (
                        <DateTimePicker
                          value={
                            task.due_date ? new Date(task.due_date) : new Date()
                          }
                          mode="date"
                          display="default"
                          minimumDate={new Date()}
                          onValueChange={handleUpdateDeadline}
                          onDismiss={() => setShowDatePicker(false)}
                        />
                      )}
                    </View>
                  </View>

                  {/* Action Buttons Row: Segregation & Completion */}
                  <View style={styles.actionButtonsRow}>
                    {TaskSegregationService.canSegregateTask(
                      profile as any,
                      task,
                    ) && (
                      <TouchableOpacity
                        style={styles.breakDownTaskBtn}
                        onPress={() => setShowSegregationModal(true)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name="git-branch-outline"
                          size={16}
                          color={Colors.primary}
                        />
                        <Text style={styles.breakDownTaskBtnText}>
                          Break Down Task / Segregate
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Subtasks / Execution Breakdown Section */}
                  {subtasks.length > 0 &&
                    (() => {
                      const subProg =
                        TaskSegregationService.calculateSubtaskProgress(
                          subtasks,
                        );
                      return (
                        <View style={styles.subtasksSection}>
                          <View style={styles.subtasksHeaderRow}>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <Ionicons
                                name="git-network-outline"
                                size={16}
                                color={Colors.primary}
                              />
                              <Text style={styles.subtasksTitle}>
                                Subtasks / Execution Breakdown
                              </Text>
                            </View>
                            <View style={styles.subtaskCountBadge}>
                              <Text style={styles.subtaskCountBadgeText}>
                                {subtasks.length} subtask
                                {subtasks.length > 1 ? "s" : ""}
                              </Text>
                            </View>
                          </View>

                          {/* Derived Progress Bar */}
                          <View style={styles.subtaskProgressCard}>
                            <View
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 6,
                              }}
                            >
                              <Text style={styles.subtaskProgressLabel}>
                                Derived Progress: {subProg.completed} of{" "}
                                {subProg.total} completed
                              </Text>
                              <Text style={styles.subtaskProgressPct}>
                                {subProg.derivedPercentage}%
                              </Text>
                            </View>
                            <View style={styles.progressBarTrack}>
                              <View
                                style={[
                                  styles.progressBarFill,
                                  { width: `${subProg.derivedPercentage}%` },
                                ]}
                              />
                            </View>
                          </View>

                          {/* Subtask Items */}
                          <View style={styles.subtasksList}>
                            {subtasks.map((st, idx) => {
                              const isDone = st.status === "Done";
                              const isOngoing = st.status === "In Progress";
                              return (
                                <TouchableOpacity
                                  key={st.id || `st-${idx}`}
                                  style={styles.subtaskItemCard}
                                  onPress={() => setCurrentTaskId(st.id)}
                                  activeOpacity={0.7}
                                >
                                  <View style={styles.subtaskItemTop}>
                                    <View
                                      style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        flex: 1,
                                        marginRight: 8,
                                        gap: 6,
                                      }}
                                    >
                                      <Ionicons
                                        name={
                                          isDone
                                            ? "checkmark-circle"
                                            : isOngoing
                                              ? "time"
                                              : "ellipse-outline"
                                        }
                                        size={16}
                                        color={
                                          isDone
                                            ? Colors.success
                                            : isOngoing
                                              ? Colors.primary
                                              : Colors.textMuted
                                        }
                                      />
                                      <Text
                                        style={[
                                          styles.subtaskItemTitle,
                                          isDone && styles.subtaskItemTitleDone,
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {st.title}
                                      </Text>
                                    </View>
                                    <View
                                      style={[
                                        styles.subtaskStatusBadge,
                                        isDone && {
                                          backgroundColor: "#dcfce7",
                                        },
                                        isOngoing && {
                                          backgroundColor: "#eff6ff",
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.subtaskStatusBadgeText,
                                          isDone && { color: "#15803d" },
                                          isOngoing && {
                                            color: Colors.primary,
                                          },
                                        ]}
                                      >
                                        {st.status}
                                      </Text>
                                    </View>
                                  </View>

                                  <View style={styles.subtaskItemBottom}>
                                    <View
                                      style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: 6,
                                      }}
                                    >
                                      <Avatar
                                        name={
                                          st.assignee?.full_name || "Unassigned"
                                        }
                                        size={16}
                                      />
                                      <Text style={styles.subtaskAssigneeName}>
                                        {st.assignee?.full_name || "Unassigned"}
                                      </Text>
                                    </View>
                                    {st.due_date && (
                                      <Text style={styles.subtaskDueDate}>
                                        Due:{" "}
                                        {new Date(
                                          st.due_date,
                                        ).toLocaleDateString()}
                                      </Text>
                                    )}
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })()}

                  <View style={styles.divider} />

                  {/* Description */}
                  {task.description && (
                    <View
                      style={{
                        marginTop: Layout.spacing.sm,
                        marginBottom: Layout.spacing.md,
                      }}
                    >
                      <Text style={styles.description}>{task.description}</Text>
                    </View>
                  )}

                  {/* Voice Notes Player */}
                  <VoiceNotePlayer
                    taskId={task.id}
                    taskCreatorId={task.created_by}
                  />
                </View>

                {/* Tabs */}
                <View style={styles.tabsContainer}>
                  <TouchableOpacity
                    style={[
                      styles.tab,
                      activeTab === "Activity" && styles.tabActive,
                    ]}
                    onPress={() => setActiveTab("Activity")}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        activeTab === "Activity" && styles.tabTextActive,
                      ]}
                    >
                      Comments
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.tab,
                      activeTab === "Attachments" && styles.tabActive,
                    ]}
                    onPress={() => setActiveTab("Attachments")}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        activeTab === "Attachments" && styles.tabTextActive,
                      ]}
                    >
                      Attachments
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Tab Content */}
                <View style={styles.tabContentContainer}>
                  {activeTab === "Activity" ? (
                    <View style={{ padding: Layout.spacing.lg }}>
                      {comments.length === 0 ? (
                        <Text style={styles.emptyText}>
                          No activity yet. Start the conversation!
                        </Text>
                      ) : (
                        comments.map((comment) => (
                          <View key={comment.id} style={styles.commentCard}>
                            <View style={styles.commentHeader}>
                              <Text style={styles.commentUser}>
                                {comment.user?.full_name || "User"}
                              </Text>
                              <Text style={styles.commentTime}>
                                {new Date(
                                  comment.created_at,
                                ).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </Text>
                            </View>
                            <Text style={styles.commentText}>
                              {comment.content}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                  ) : activeTab === "Attachments" ? (
                    <View style={{ padding: Layout.spacing.lg }}>
                      {/* Total Size & Upload Button */}
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 12,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontFamily: Typography.fontFamily.semiBold,
                            color: Colors.textSecondary,
                          }}
                        >
                          {files.length} Attachment
                          {files.length !== 1 ? "s" : ""}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontFamily: Typography.fontFamily.medium,
                            color: Colors.textMuted,
                          }}
                        >
                          {formatFileSize(totalAttachmentBytes)} / 20 MB
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.uploadBtn}
                        onPress={handleFileUpload}
                        disabled={uploadingFile}
                        activeOpacity={0.7}
                      >
                        {uploadingFile ? (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <ActivityIndicator
                              size="small"
                              color={Colors.primary}
                              style={{ marginRight: 8 }}
                            />
                            <Text style={styles.uploadTitle}>
                              Uploading Attachments...
                            </Text>
                          </View>
                        ) : (
                          <>
                            <Ionicons
                              name="cloud-upload-outline"
                              size={28}
                              color={Colors.primary}
                              style={{ marginBottom: Layout.spacing.xs }}
                            />
                            <Text style={styles.uploadTitle}>
                              Attach Documents
                            </Text>
                            <Text style={styles.uploadSubtitle}>
                              PDF, DOCX, XLSX, CSV, PPTX, Images, ZIP
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <View style={{ marginTop: 16, gap: 10 }}>
                        {files.length === 0 && !uploadingFile ? (
                          <View
                            style={{
                              alignItems: "center",
                              paddingVertical: 24,
                            }}
                          >
                            <Ionicons
                              name="attach-outline"
                              size={40}
                              color={Colors.textMuted}
                            />
                            <Text style={[styles.emptyText, { marginTop: 8 }]}>
                              No attachments on this task yet.
                            </Text>
                          </View>
                        ) : (
                          files.map((file) => {
                            const canDelete =
                              file.user_id === profile?.id ||
                              isExecutiveOrAdmin(profile) ||
                              task?.created_by === profile?.id ||
                              (profile?.role &&
                                ["Department Head", "Manager"].includes(
                                  profile.role,
                                ) &&
                                task?.department_id === profile?.department_id);

                            return (
                              <View key={file.id} style={styles.attachmentCard}>
                                <TouchableOpacity
                                  style={{
                                    flex: 1,
                                    flexDirection: "row",
                                    alignItems: "center",
                                  }}
                                  onPress={() => {
                                    if (file.file_url) {
                                      Linking.openURL(file.file_url);
                                    }
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <View style={styles.fileIconWrapper}>
                                    {getFileIcon(
                                      file.file_type || "",
                                      file.file_name || "",
                                    )}
                                  </View>
                                  <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text
                                      style={styles.fileName}
                                      numberOfLines={1}
                                    >
                                      {file.file_name ||
                                        (file.file_type
                                          ? `Attachment.${file.file_type}`
                                          : "Attachment")}
                                    </Text>
                                    <View
                                      style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        marginTop: 3,
                                      }}
                                    >
                                      <Text style={styles.fileSizeText}>
                                        {formatFileSize(file.file_size)}
                                      </Text>
                                      <Text style={styles.fileDot}>•</Text>
                                      <Text
                                        style={styles.fileUploaderText}
                                        numberOfLines={1}
                                      >
                                        {file.user?.full_name || "Uploader"}
                                      </Text>
                                      <Text style={styles.fileDot}>•</Text>
                                      <Text style={styles.fileDate}>
                                        {new Date(
                                          file.created_at,
                                        ).toLocaleDateString([], {
                                          month: "short",
                                          day: "numeric",
                                        })}
                                      </Text>
                                    </View>
                                  </View>
                                  <Ionicons
                                    name="open-outline"
                                    size={16}
                                    color={Colors.textSecondary}
                                    style={{ marginRight: 6 }}
                                  />
                                </TouchableOpacity>

                                {canDelete && (
                                  <TouchableOpacity
                                    onPress={() => handleDeleteFile(file.id)}
                                    style={styles.deleteFileBtn}
                                    activeOpacity={0.7}
                                  >
                                    <Ionicons
                                      name="trash-outline"
                                      size={18}
                                      color={Colors.danger}
                                    />
                                  </TouchableOpacity>
                                )}
                              </View>
                            );
                          })
                        )}
                      </View>
                    </View>
                  ) : null}
                </View>

                {!(task.status === "Done" || task.status === "Completed") && (
                  <View style={{ paddingHorizontal: 20, paddingBottom: 24, paddingTop: 16 }}>
                    <TouchableOpacity
                      style={[styles.completeTaskBtn, { width: '100%', justifyContent: 'center' }]}
                      onPress={handleMarkCompleted}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={Colors.textInverse}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={[styles.completeTaskBtnText, { fontSize: 16 }]}>
                        Mark as Completed
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

              </ScrollView>

              {/* Fixed Composer for Comments */}
              {activeTab === "Activity" && (
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="Type a message..."
                    placeholderTextColor={Colors.textMuted}
                    value={newComment}
                    onChangeText={setNewComment}
                    multiline
                  />
                  <TouchableOpacity
                    onPress={handlePostComment}
                    disabled={postingComment || !newComment.trim()}
                    style={[
                      styles.sendBtn,
                      newComment.trim()
                        ? { backgroundColor: Colors.textPrimary }
                        : { backgroundColor: Colors.borderSubtle },
                    ]}
                  >
                    {postingComment ? (
                      <ActivityIndicator
                        size="small"
                        color={Colors.textInverse}
                      />
                    ) : (
                      <Send
                        size={20}
                        color={
                          newComment.trim()
                            ? Colors.textInverse
                            : Colors.textMuted
                        }
                        style={{ marginLeft: -2 }}
                      />
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <View style={styles.center}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: Colors.surfaceSecondary,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <Ionicons
                  name="document-text-outline"
                  size={32}
                  color={Colors.textMuted}
                />
              </View>
              <Text
                style={{
                  color: Colors.textPrimary,
                  fontSize: Typography.fontSize.lg,
                  fontFamily: Typography.fontFamily.bold,
                  marginBottom: 6,
                }}
              >
                Task Unavailable
              </Text>
              <Text
                style={{
                  color: Colors.textSecondary,
                  fontSize: Typography.fontSize.sm,
                  fontFamily: Typography.fontFamily.regular,
                  textAlign: "center",
                  maxWidth: 300,
                  marginBottom: 20,
                  lineHeight: 20,
                }}
              >
                This task is no longer available in the workspace or has been
                removed.
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  backgroundColor: Colors.primary,
                  borderRadius: Layout.radius.md,
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={{
                    color: Colors.textInverse,
                    fontFamily: Typography.fontFamily.bold,
                  }}
                >
                  Return to Dashboard
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Edit Assignees Modal */}
          <Modal
            visible={showEditAssignees}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowEditAssignees(false)}
          >
            <View style={styles.editModalOverlay}>
              <View style={styles.editModalCard}>
                <View style={styles.editModalHeader}>
                  <Text style={styles.editModalTitle}>Edit Assignees</Text>
                  <TouchableOpacity onPress={() => setShowEditAssignees(false)}>
                    <Ionicons
                      name="close"
                      size={24}
                      color={Colors.textPrimary}
                    />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.editModalList}>
                  {groupedAssigneePool.map((group) => (
                    <View key={group.sectionTitle}>
                      <View style={styles.groupHeader}>
                        <Text style={styles.groupHeaderText}>
                          {group.sectionTitle}
                        </Text>
                      </View>
                      {group.users.map((u) => (
                        <TouchableOpacity
                          key={u.id}
                          style={[
                            styles.dropdownItem,
                            selectedAssigneeIds.includes(u.id) &&
                              styles.dropdownItemActive,
                          ]}
                          onPress={() => {
                            if (selectedAssigneeIds.includes(u.id)) {
                              setSelectedAssigneeIds((prev) =>
                                prev.filter((id) => id !== u.id),
                              );
                            } else {
                              setSelectedAssigneeIds((prev) => [...prev, u.id]);
                            }
                          }}
                        >
                          <View style={{ flex: 1, marginRight: 12 }}>
                            <Text
                              style={[
                                styles.dropdownItemText,
                                selectedAssigneeIds.includes(u.id) &&
                                  styles.dropdownItemTextActive,
                              ]}
                            >
                              {u.full_name || "Unnamed User"}
                            </Text>
                            <Text style={styles.dropdownItemSubtitle}>
                              {u.role || "Member"} ·{" "}
                              {u.department?.name || "General"}
                            </Text>
                          </View>
                          {selectedAssigneeIds.includes(u.id) ? (
                            <Ionicons
                              name="checkbox"
                              size={22}
                              color={Colors.primary}
                            />
                          ) : (
                            <Ionicons
                              name="square-outline"
                              size={22}
                              color={Colors.textMuted}
                            />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.editModalFooter}>
                  <TouchableOpacity
                    style={[
                      styles.saveAssigneesBtn,
                      savingAssignees && { opacity: 0.6 },
                    ]}
                    onPress={handleSaveAssignees}
                    disabled={savingAssignees}
                  >
                    {savingAssignees ? (
                      <ActivityIndicator
                        size="small"
                        color={Colors.textInverse}
                      />
                    ) : (
                      <Text style={styles.saveAssigneesBtnText}>
                        Save Assignees ({selectedAssigneeIds.length})
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Task Segregation / Decomposition Modal */}
          <TaskSegregationModal
            visible={showSegregationModal}
            parentTask={task}
            onClose={() => setShowSegregationModal(false)}
            onSuccess={() => {
              fetchTaskData(currentTaskId);
              onTaskUpdated?.(task);
            }}
          />
        </KeyboardAvoidingView>
      </Modal>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: Colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    paddingTop: 48, // safe area approx
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.semiBold,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  deleteText: {
    color: Colors.semanticPeach,
    fontFamily: Typography.fontFamily.medium,
    fontSize: 15,
  },
  doneText: {
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.medium,
    fontSize: 15,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  taskInfoContainer: {
    padding: 24,
    backgroundColor: Colors.canvas,
  },
  taskTitle: {
    fontSize: 28,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 24,
  },
  propertyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  propertyLabel: {
    width: 120,
    color: Colors.textSecondary,
    fontSize: 15,
  },
  statusBadge: {
    backgroundColor: Colors.surfaceRaised,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    color: Colors.textPrimary,
    fontSize: 15,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.medium,
  },
  propertyValue: {
    color: Colors.textPrimary,
    fontSize: 15,
  },
  progressChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  progressChipActive: {
    backgroundColor: Colors.semanticBlue + "1A",
    borderColor: Colors.semanticBlue,
  },
  progressChipText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  progressChipTextActive: {
    color: Colors.semanticBlue,
    fontFamily: Typography.fontFamily.bold,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    width: "100%",
    marginVertical: 16,
  },
  description: {
    color: Colors.textPrimary,
    fontSize: 16,
    lineHeight: 24,
  },
  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.canvas,
    paddingHorizontal: 24,
  },
  tab: {
    paddingVertical: 12,
    flex: 1,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.textPrimary,
  },
  tabText: {
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.textPrimary,
  },
  tabContentContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  emptyText: {
    textAlign: "center",
    color: Colors.textMuted,
    marginTop: 40,
  },
  commentCard: {
    marginBottom: 16,
    backgroundColor: Colors.surfaceRaised,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  commentUser: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  commentTime: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  commentText: {
    color: Colors.textSecondary,
  },
  inputContainer: {
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 24 : 16, // SafeArea buffer
    backgroundColor: Colors.canvas,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: 12,
    borderRadius: 24,
    marginRight: 12,
    color: Colors.textPrimary,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadBtn: {
    width: "100%",
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.borderStrong,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  uploadTitle: {
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  uploadSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  filesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  fileCard: {
    width: "48%",
    backgroundColor: Colors.surfaceRaised,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 16,
    alignItems: "center",
  },
  fileName: {
    fontSize: 12,
    textAlign: "center",
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginTop: 8,
    marginBottom: 4,
  },
  fileDate: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  editBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  editBadgeText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  assigneeSubtitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  editModalCard: {
    width: "100%",
    maxHeight: "80%",
    backgroundColor: Colors.canvas,
    borderRadius: Layout.radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  editModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  editModalTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  editModalList: {
    maxHeight: 350,
  },
  groupHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceSubtle,
  },
  groupHeaderText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Layout.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  dropdownItemActive: {
    backgroundColor: Colors.surface,
  },
  dropdownItemText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.medium,
  },
  dropdownItemTextActive: {
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.bold,
  },
  dropdownItemSubtitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  editModalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.canvas,
  },
  saveAssigneesBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: Layout.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveAssigneesBtnText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
  },
  completeTaskBtn: {
    flexDirection: "row",
    backgroundColor: Colors.semanticSage,
    paddingVertical: Layout.spacing.md,
    paddingHorizontal: Layout.spacing.lg,
    borderRadius: Layout.radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Layout.spacing.sm,
  },
  completeTaskBtnText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.md,
  },
  attachmentCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    padding: Layout.spacing.md,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    ...Layout.shadow.card,
  },
  fileIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  fileSizeText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
  fileDot: {
    fontSize: 11,
    color: Colors.textMuted,
    marginHorizontal: 4,
  },
  fileUploaderText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
    maxWidth: 100,
  },
  deleteFileBtn: {
    padding: 8,
    marginLeft: 4,
  },
  overdueAlertBanner: {
    backgroundColor: "#FFF5F5",
    borderWidth: 1,
    borderColor: "#FED7D7",
    borderRadius: Layout.radius.md,
    padding: Layout.spacing.md,
    marginBottom: Layout.spacing.md,
    gap: 12,
  },
  overdueAlertTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 12,
    color: Colors.danger,
    letterSpacing: 0.8,
  },
  overdueAlertDesc: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.xs,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  sendReminderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.danger,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Layout.radius.sm,
    alignSelf: "flex-start",
  },
  sendReminderBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.xs,
    color: Colors.textInverse,
  },
  parentBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: Layout.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: Layout.spacing.md,
    gap: 8,
  },
  parentBannerText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
  },
  parentBannerTitle: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.bold,
  },
  actionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
    marginBottom: Layout.spacing.md,
  },
  breakDownTaskBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Layout.radius.md,
    gap: 6,
  },
  breakDownTaskBtnText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  subtasksSection: {
    marginTop: Layout.spacing.md,
    marginBottom: Layout.spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.lg,
    padding: Layout.spacing.md,
  },
  subtasksHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Layout.spacing.sm,
  },
  subtasksTitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  subtaskCountBadge: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  subtaskCountBadgeText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
  },
  subtaskProgressCard: {
    backgroundColor: Colors.background,
    borderRadius: Layout.radius.md,
    padding: 10,
    marginBottom: Layout.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  subtaskProgressLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  subtaskProgressPct: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primary,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: "#e2e8f0",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  subtasksList: {
    gap: 8,
  },
  subtaskItemCard: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: 10,
  },
  subtaskItemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  subtaskItemTitle: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
    flex: 1,
  },
  subtaskItemTitleDone: {
    textDecorationLine: "line-through",
    color: Colors.textMuted,
  },
  subtaskStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#f1f5f9",
  },
  subtaskStatusBadgeText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
  },
  subtaskItemBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  subtaskAssigneeName: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  subtaskDueDate: {
    fontSize: 10,
    color: Colors.textMuted,
  },
});

export default TaskPreviewModal;
