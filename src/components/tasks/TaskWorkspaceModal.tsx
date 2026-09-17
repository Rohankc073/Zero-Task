import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { Colors, Typography, Layout } from "../../theme/tokens";
import { Task, ActivityComment, TaskBreadcrumb } from "../../types";
import { TaskService } from "../../services/tasks/TaskService";
import { TaskEventBus } from "../../services/tasks/TaskEventBus";
import { useAuth } from "../../context/AuthContext";
import { canDeleteTask } from "../../utils/permissions";
import { isTaskOverdue, getDaysOverdue } from "../../utils/dateUtils";
import { Avatar } from "../ui/Avatar";
import VoiceNotePlayer from "../VoiceNotePlayer";
import VoiceNoteRecorder from "../VoiceNoteRecorder";
import * as DocumentPicker from "expo-document-picker";
import {
  processAndUploadAttachment,
  validateAttachment,
  formatFileSize,
  SUPPORTED_DOCUMENT_MIME_TYPES,
} from "../../utils/attachmentPipeline";
import { PendingVoiceNote, uploadPendingVoiceNotes } from "../../services/tasks/VoiceNoteService";
import { CommentService, TaskComment } from "../../services/tasks/CommentService";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface TaskWorkspaceModalProps {
  taskId: string | null;
  visible: boolean;
  onClose: () => void;
  onTaskUpdated?: (updatedTask: any) => void;
  /** Deprecated prop from previous PreviewModal; ignored in new single workspace */
  isSimplePreview?: boolean;
}

export const TaskWorkspaceModal: React.FC<TaskWorkspaceModalProps> = ({
  taskId,
  visible,
  onClose,
  onTaskUpdated,
}) => {
  const { profile, session } = useAuth();

  // Navigation stack for hierarchy drill-down within the same screen
  const [history, setHistory] = useState<string[]>([]);
  const currentTaskId = history.length > 0 ? history[history.length - 1] : taskId;

  // Current task state
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<{ status?: number; message: string } | null>(null);

  // Inline Add Subtask form state
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newSubtaskPriority, setNewSubtaskPriority] = useState<"Low" | "Medium" | "High" | "Urgent">("Medium");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [eligibleAssignees, setEligibleAssignees] = useState<any[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState(false);
  const [creatingSubtask, setCreatingSubtask] = useState(false);
  const [subtaskDocuments, setSubtaskDocuments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [subtaskVoiceNotes, setSubtaskVoiceNotes] = useState<PendingVoiceNote[]>([]);
  const [subtaskCreationProgress, setSubtaskCreationProgress] = useState<string>("");

  // Comments state
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [savingEditComment, setSavingEditComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  // Subtask collapsible
  const [subtasksExpanded, setSubtasksExpanded] = useState(true);

  // Edit task modal state
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<"Low" | "Medium" | "High" | "Urgent">("Medium");
  const [editAssigneeIds, setEditAssigneeIds] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  // Status picker and 3-dots menu
  const [isStatusPickerVisible, setIsStatusPickerVisible] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  // Toggling status / deleting task
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);

  // Synchronize history with incoming taskId on open
  useEffect(() => {
    if (visible && taskId) {
      setHistory([taskId]);
    } else if (!visible) {
      setHistory([]);
      setTask(null);
      setSubtasks([]);
      setComments([]);
      setIsAddingSubtask(false);
      setSubtasksExpanded(true);
      setFetchError(null);
      setSubtaskDocuments([]);
      setSubtaskVoiceNotes([]);
      setSubtaskCreationProgress("");
      setEditingCommentId(null);
    }
  }, [visible, taskId]);

  const loadEligibleAssignees = async (parentTaskId: string) => {
    try {
      setLoadingAssignees(true);
      const res = await TaskService.getEligibleAssignees(parentTaskId);
      if (res.data && Array.isArray(res.data)) {
        setEligibleAssignees(res.data);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingAssignees(false);
    }
  };

  const loadComments = useCallback(async (id: string) => {
    try {
      setLoadingComments(true);
      const res = await CommentService.getComments(id);
      if (res.data) {
        setComments(res.data);
      }
    } catch {
      // Non-fatal: comments silently fail
    } finally {
      setLoadingComments(false);
    }
  }, []);

  // Load current task data
  const loadTask = useCallback(async (id: string) => {
    setLoading(true);
    setFetchError(null);

    try {
      const res = await TaskService.getTaskById(id);
      if (res.data) {
        const t = res.data;
        setTask(t);
        const directSubtasks = (t.subtasks || []).filter((s) => s && s.id);
        setSubtasks(directSubtasks);

        // Preload eligible assignees and comments
        loadEligibleAssignees(id);
        loadComments(id);
      } else {
        const errStatus = res.error?.status || 404;
        const errMsg = res.error?.message || "Task not found";
        setFetchError({ status: errStatus, message: errMsg });
        setTask(null);
      }
    } catch (err: any) {
      setFetchError({ status: 500, message: err?.message || "Network error" });
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [loadComments]);

  useEffect(() => {
    if (visible && currentTaskId) {
      loadTask(currentTaskId);
    }
  }, [visible, currentTaskId, loadTask]);

  // Listen to TaskEventBus for external mutations
  useEffect(() => {
    if (!visible) return;
    const unsub = TaskEventBus.subscribe((_, payload) => {
      if (!currentTaskId) return;
      const taskMatches =
        payload?.taskId === currentTaskId ||
        payload?.task?.id === currentTaskId ||
        payload?.parent_task_id === currentTaskId;
      const commentAction = payload?.action as string | undefined;
      if (taskMatches) {
        if (commentAction === 'comment_created' || commentAction === 'comment_updated' || commentAction === 'comment_deleted') {
          // Refresh only comments, not the whole task
          loadComments(currentTaskId);
        } else {
          loadTask(currentTaskId);
        }
      }
    });
    return unsub;
  }, [visible, currentTaskId, loadTask, loadComments]);

  // Breadcrumbs calculation from backend ancestors or history
  const breadcrumbs = useMemo<TaskBreadcrumb[]>(() => {
    if (!task) return [];
    const list: TaskBreadcrumb[] = [];
    if (task.ancestors && Array.isArray(task.ancestors)) {
      task.ancestors.forEach((anc, idx) => {
        list.push({ id: anc.id, title: anc.title, depth: anc.depth || idx + 1 });
      });
    }
    // Append current task
    list.push({
      id: task.id,
      title: task.title,
      depth: task.depth || (task.ancestors ? task.ancestors.length + 1 : 1),
    });
    return list;
  }, [task]);

  const currentDepth = task?.depth || breadcrumbs.length || 1;
  const isMaxDepthReached = currentDepth >= 5;

  // Back navigation: pops one level in hierarchy; closes if at root
  const handleBack = () => {
    if (history.length > 1) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setHistory((prev) => prev.slice(0, -1));
    } else {
      onClose();
    }
  };

  // Jump directly to an ancestor in the breadcrumb
  const handleJumpToAncestor = (targetId: string) => {
    if (targetId === currentTaskId) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const existingIndex = history.indexOf(targetId);
    if (existingIndex !== -1) {
      setHistory((prev) => prev.slice(0, existingIndex + 1));
    } else {
      setHistory([targetId]);
    }
  };

  // Drill down into a child task (stays within the SAME screen)
  const handleSelectChild = (childId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsAddingSubtask(false);
    setSubtaskDocuments([]);
    setSubtaskVoiceNotes([]);
    setSubtaskCreationProgress("");
    setHistory((prev) => [...prev, childId]);
  };

  const totalSubtaskAttachmentBytes = useMemo(() => {
    return subtaskDocuments.reduce((sum, d) => sum + (d.size || 0), 0);
  }, [subtaskDocuments]);

  const handlePickSubtaskDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: SUPPORTED_DOCUMENT_MIME_TYPES,
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        let runningTotal = totalSubtaskAttachmentBytes;
        const validDocs: DocumentPicker.DocumentPickerAsset[] = [];

        for (const doc of result.assets) {
          const validation = validateAttachment(
            { name: doc.name, size: doc.size, mimeType: doc.mimeType },
            runningTotal
          );
          if (!validation.valid) {
            Alert.alert("Validation Error", validation.error || "Invalid file");
            return;
          }
          runningTotal += doc.size || 0;
          validDocs.push(doc);
        }

        setSubtaskDocuments((prev) => [...prev, ...validDocs]);
      }
    } catch (err) {
      console.log("Error picking subtask documents", err);
      Alert.alert("Error", "Could not open document picker.");
    }
  };

  const handleRemoveSubtaskDocument = (index: number) => {
    setSubtaskDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  // Toggle inline Add Subtask section
  const handleToggleAddSubtask = () => {
    if (isMaxDepthReached) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsAddingSubtask((prev) => !prev);
    if (!isAddingSubtask) {
      setNewSubtaskTitle("");
      setSelectedAssigneeIds([]);
      setNewSubtaskPriority("Medium");
      setSubtaskDocuments([]);
      setSubtaskVoiceNotes([]);
      setSubtaskCreationProgress("");
    }
  };

  // Create subtask under current task
  const handleCreateSubtask = async () => {
    if (!newSubtaskTitle.trim()) {
      Alert.alert("Required", "Please enter a subtask title.");
      return;
    }
    if (!currentTaskId) return;

    try {
      setCreatingSubtask(true);
      setSubtaskCreationProgress("Creating subtask...");
      const finalAssignees = selectedAssigneeIds.length > 0 ? selectedAssigneeIds : (profile?.id ? [profile.id] : []);
      const payload = {
        title: newSubtaskTitle.trim(),
        priority: newSubtaskPriority,
        parent_task_id: currentTaskId,
        assignee_ids: finalAssignees,
        user_id: finalAssignees[0] || undefined,
        company_id: task?.company_id || profile?.company_id || undefined,
      };

      const res = await TaskService.createTask(payload);
      if (res.data) {
        const createdChild = res.data;
        const newChildId = createdChild.id;
        const uploaderId = session?.user?.id || profile?.id;

        // Upload attached documents if any
        if (subtaskDocuments.length > 0 && uploaderId) {
          for (let i = 0; i < subtaskDocuments.length; i++) {
            const doc = subtaskDocuments[i];
            setSubtaskCreationProgress(`Uploading document ${i + 1}/${subtaskDocuments.length}...`);
            try {
              const resultData = await processAndUploadAttachment(
                doc.uri,
                doc.name,
                doc.mimeType || "application/octet-stream",
                "task-attachments",
                uploaderId,
                0,
                doc.size
              );

              await TaskService.createTaskFile(newChildId, {
                file_url: resultData.url,
                file_name: resultData.name,
                file_type: resultData.type,
                file_size: resultData.size,
                mime_type: resultData.mimeType,
                storage_path: resultData.storagePath,
              });
            } catch (fileErr: any) {
              console.warn("[TaskWorkspaceModal] Subtask document upload warning:", fileErr);
            }
          }
        }

        // Upload voice notes if any
        if (subtaskVoiceNotes.length > 0 && uploaderId) {
          setSubtaskCreationProgress(`Uploading ${subtaskVoiceNotes.length} voice note(s)...`);
          try {
            await uploadPendingVoiceNotes(newChildId, uploaderId, subtaskVoiceNotes);
          } catch (voiceErr: any) {
            console.warn("[TaskWorkspaceModal] Subtask voice note upload warning:", voiceErr);
          }
        }

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsAddingSubtask(false);
        setNewSubtaskTitle("");
        setSelectedAssigneeIds([]);
        setSubtaskDocuments([]);
        setSubtaskVoiceNotes([]);
        setSubtaskCreationProgress("");
        await loadTask(currentTaskId);
        if (task) onTaskUpdated?.(task);
      } else {
        Alert.alert("Error", res.error?.message || "Failed to create subtask.");
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Could not create subtask.");
    } finally {
      setCreatingSubtask(false);
      setSubtaskCreationProgress("");
    }
  };

  // Toggle Complete / Reopen task
  const handleToggleComplete = async () => {
    if (!task) return;
    const isCurrentlyDone = task.status === "Done" || (task.status as any) === "Completed";
    const nextStatus = isCurrentlyDone ? "In Progress" : "Done";

    try {
      setTogglingStatus(true);
      const res = isCurrentlyDone
        ? await TaskService.updateTask(task.id, { status: nextStatus })
        : await TaskService.completeTask(task.id);

      if (res.data) {
        setTask(res.data);
        onTaskUpdated?.(res.data);
      } else {
        Alert.alert("Unable to complete", res.error?.message || "Cannot update status.");
      }
    } catch (err: any) {
      Alert.alert("Action failed", err?.message || "Failed to update status.");
    } finally {
      setTogglingStatus(false);
    }
  };

  // Delete Task
  const handleDelete = () => {
    if (!task) return;
    Alert.alert("Delete Task", `Are you sure you want to delete "${task.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingTask(true);
            const res = await TaskService.deleteTask(task.id);
            if (!res.error) {
              onTaskUpdated?.({ id: task.id, _deleted: true });
              handleBack();
            } else {
              Alert.alert("Error", res.error.message || "Failed to delete task.");
            }
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Could not delete task.");
          } finally {
            setDeletingTask(false);
          }
        },
      },
    ]);
  };

  // Post Comment (real CommentService)
  const handlePostComment = async () => {
    if (!newCommentText.trim() || !task || !profile?.id) return;
    const content = newCommentText.trim();
    // Optimistic insert
    const optimisticComment: TaskComment = {
      id: `optimistic_${Date.now()}`,
      task_id: task.id,
      user_id: profile.id,
      content,
      created_at: new Date().toISOString(),
      user: {
        id: profile.id,
        full_name: (profile as any).full_name || (profile as any).name || "You",
        email: (profile as any).email,
        role: (profile as any).role,
      },
    };
    setComments((prev) => [...prev, optimisticComment]);
    setNewCommentText("");
    try {
      setPostingComment(true);
      const res = await CommentService.addComment(task.id, content);
      if (res.data) {
        // Replace optimistic with server response
        setComments((prev) =>
          prev.map((c) => (c.id === optimisticComment.id ? res.data! : c))
        );
      } else {
        // Rollback
        setComments((prev) => prev.filter((c) => c.id !== optimisticComment.id));
        Alert.alert("Error", res.error?.message || "Could not post comment.");
      }
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== optimisticComment.id));
      Alert.alert("Error", "Could not send comment.");
    } finally {
      setPostingComment(false);
    }
  };

  // Edit Comment
  const handleEditComment = async (commentId: string) => {
    if (!task || !editCommentText.trim()) return;
    try {
      setSavingEditComment(true);
      const res = await CommentService.updateComment(task.id, commentId, editCommentText.trim());
      if (res.data) {
        setComments((prev) => prev.map((c) => (c.id === commentId ? res.data! : c)));
        setEditingCommentId(null);
        setEditCommentText("");
      } else {
        Alert.alert("Error", res.error?.message || "Could not update comment.");
      }
    } catch {
      Alert.alert("Error", "Could not update comment.");
    } finally {
      setSavingEditComment(false);
    }
  };

  // Delete Comment
  const handleDeleteComment = (commentId: string) => {
    Alert.alert("Delete Comment", "Are you sure you want to delete this comment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!task) return;
          setDeletingCommentId(commentId);
          try {
            const res = await CommentService.deleteComment(task.id, commentId);
            if (!res.error) {
              setComments((prev) => prev.filter((c) => c.id !== commentId));
            } else {
              Alert.alert("Error", res.error.message || "Could not delete comment.");
            }
          } catch {
            Alert.alert("Error", "Could not delete comment.");
          } finally {
            setDeletingCommentId(null);
          }
        },
      },
    ]);
  };

  const isDone = task?.status === "Done" || (task?.status as any) === "Completed";
  const overdue = task ? isTaskOverdue(task.due_date, isDone) : false;
  const daysOverdue = task ? getDaysOverdue(task.due_date, isDone) : 0;
  const canDelete = task ? canDeleteTask(profile, task) : false;

  const getStatusTheme = (st?: string) => {
    const s = (st || "").toLowerCase();
    if (s === "in progress" || s === "in_progress") {
      return {
        bg: "#DCFCE7",
        dot: "#16A34A",
        text: "#15803D",
        chevron: "#15803D",
        label: "In Progress",
      };
    }
    if (s === "done" || s === "completed") {
      return {
        bg: "#F3E8FF",
        dot: "#9333EA",
        text: "#7E22CE",
        chevron: "#7E22CE",
        label: "Completed",
      };
    }
    if (s === "in review" || s === "in_review") {
      return {
        bg: "#FEF3C7",
        dot: "#D97706",
        text: "#B45309",
        chevron: "#B45309",
        label: "In Review",
      };
    }
    return {
      bg: "#E0F2FE",
      dot: "#0284C7",
      text: "#0369A1",
      chevron: "#0369A1",
      label: st || "Not Started",
    };
  };

  const getLetterAndTitle = (
    title: string,
    index: number = 0,
    isRoot: boolean = false
  ): { letter: string; displayTitle: string; cleanTitle: string } => {
    if (!title) return { letter: isRoot ? "A" : String.fromCharCode(66 + (index % 25)), displayTitle: "", cleanTitle: "" };
    const match = title.match(/^([A-Za-z0-9])\s*[-—–:]\s*(.*)$/);
    if (match) {
      return {
        letter: match[1].toUpperCase(),
        displayTitle: `${match[1].toUpperCase()} — ${match[2].trim()}`,
        cleanTitle: match[2].trim(),
      };
    }
    const defaultLetter = isRoot ? "A" : String.fromCharCode(66 + (index % 25));
    return {
      letter: defaultLetter,
      displayTitle: `${defaultLetter} — ${title.trim()}`,
      cleanTitle: title.trim(),
    };
  };

  const taskLetterInfo = task
    ? getLetterAndTitle(task.title, 0, currentDepth === 1)
    : { letter: "A", displayTitle: "", cleanTitle: "" };
  const taskLetter = taskLetterInfo.letter;
  const taskDisplayTitle = taskLetterInfo.displayTitle;

  const hierarchyPathString = useMemo(() => {
    if (breadcrumbs.length === 0) return "A";
    return breadcrumbs
      .map((b, idx) => {
        const match = b.title.match(/^([A-Za-z0-9])\s*[-—–:]/);
        if (match) return match[1].toUpperCase();
        return idx === 0 ? "A" : String.fromCharCode(65 + idx);
      })
      .join(" → ");
  }, [breadcrumbs]);

  const handleUpdateStatus = async (newStatus: "Not Started" | "In Progress" | "In Review" | "Done") => {
    if (!task) return;
    setIsStatusPickerVisible(false);
    setTogglingStatus(true);
    try {
      const res = await TaskService.updateTask(task.id, { status: newStatus as any });
      if (res.data) {
        setTask((prev) => (prev ? { ...prev, status: newStatus as any } : null));
        onTaskUpdated?.(res.data);
      }
    } catch {
      Alert.alert("Error", "Could not update status.");
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleOpenEdit = () => {
    if (!task) return;
    const { cleanTitle } = getLetterAndTitle(task.title, 0, currentDepth === 1);
    setEditTitle(cleanTitle || task.title);
    setEditDescription(task.description || "");
    setEditPriority((task.priority as any) || "Medium");

    const currentAssigneeIds: string[] = [];
    if ((task as any).assignees && Array.isArray((task as any).assignees)) {
      (task as any).assignees.forEach((a: any) => {
        const uid = a.user_id || a.user?.id || a.id;
        if (uid && !currentAssigneeIds.includes(uid)) currentAssigneeIds.push(uid);
      });
    }
    if (currentAssigneeIds.length === 0 && (task.assignee?.id || (task as any).user_id)) {
      const uid = task.assignee?.id || (task as any).user_id;
      if (uid) currentAssigneeIds.push(uid);
    }
    setEditAssigneeIds(currentAssigneeIds);
    setIsEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!task || !editTitle.trim()) return;
    setSavingEdit(true);
    try {
      const updatedTitle = `${taskLetter} — ${editTitle.trim()}`;
      const res = await TaskService.updateTask(task.id, {
        title: updatedTitle,
        description: editDescription.trim(),
        priority: editPriority,
        assignee_ids: editAssigneeIds,
      });
      if (res.data) {
        setTask(res.data);
        onTaskUpdated?.(res.data);
        setIsEditModalVisible(false);
        if (currentTaskId) await loadTask(currentTaskId);
      } else {
        Alert.alert("Error", res.error?.message || "Failed to update task.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save task edits.");
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleBack}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* ── Top Header: Back Arrow, Brand Center, Menu ── */}
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={handleBack} style={styles.headerBtn} activeOpacity={0.7} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerBrandCenter}>
            <View style={styles.brandIconBox}>
              <Text style={styles.brandIconText}>Z</Text>
            </View>
            <Text style={styles.brandTitleText}>ZeroTask</Text>
          </View>

          <TouchableOpacity
            onPress={() => setIsMenuVisible(true)}
            style={styles.headerBtn}
            activeOpacity={0.7}
            accessibilityLabel="Menu"
          >
            <Ionicons name="ellipsis-vertical" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* ── Content Body ── */}
        {loading && !task ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading task...</Text>
          </View>
        ) : fetchError?.status === 403 ? (
          <View style={styles.centerBox}>
            <View style={styles.errorIconCircle}>
              <Ionicons name="lock-closed-outline" size={32} color={Colors.danger} />
            </View>
            <Text style={styles.errorTitle}>Access Denied</Text>
            <Text style={styles.errorSubtitle}>You do not have authorization to view this task.</Text>
            <TouchableOpacity style={styles.primaryActionBtn} onPress={onClose}>
              <Text style={styles.primaryActionBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : fetchError && fetchError.status && fetchError.status >= 500 ? (
          <View style={styles.centerBox}>
            <View style={styles.errorIconCircle}>
              <Ionicons name="cloud-offline-outline" size={32} color={Colors.warning} />
            </View>
            <Text style={styles.errorTitle}>Connection Error</Text>
            <Text style={styles.errorSubtitle}>Could not load task details. Tap to retry.</Text>
            <TouchableOpacity style={styles.primaryActionBtn} onPress={() => currentTaskId && loadTask(currentTaskId)}>
              <Text style={styles.primaryActionBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !task ? (
          <View style={styles.centerBox}>
            <View style={styles.errorIconCircle}>
              <Ionicons name="document-text-outline" size={32} color={Colors.textMuted} />
            </View>
            <Text style={styles.errorTitle}>Task Not Found</Text>
            <Text style={styles.errorSubtitle}>This task is no longer available in the workspace.</Text>
            <TouchableOpacity style={styles.primaryActionBtn} onPress={onClose}>
              <Text style={styles.primaryActionBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Overdue Banner */}
            {overdue && (
              <View style={styles.overdueBanner}>
                <Ionicons name="alert-circle" size={20} color={Colors.danger} />
                <Text style={styles.overdueBannerText}>
                  Overdue by {daysOverdue === 1 ? "1 day" : `${daysOverdue} days`} · Due was {task.due_date ? new Date(task.due_date).toLocaleDateString() : ""}
                </Text>
              </View>
            )}

            {/* ── Task Header Card (Design format matching screenshot) ── */}
            <View style={styles.taskHeroCard}>
              <View style={styles.heroTopRow}>
                {/* Big Letter Avatar */}
                <View style={styles.heroAvatarCircle}>
                  <Text style={styles.heroAvatarText}>{taskLetter}</Text>
                </View>

                {/* Title & Subtitle */}
                <View style={styles.heroTitleCol}>
                  <Text style={styles.heroTaskTitle} numberOfLines={2}>
                    {taskDisplayTitle}
                  </Text>
                  <Text style={styles.heroSubtitle}>
                    {currentDepth === 1 ? "Main Task" : `Level ${currentDepth} Subtask`}
                  </Text>
                </View>
              </View>

              {/* Status Pill Dropdown */}
              <View style={styles.statusPillContainer}>
                {(() => {
                  const theme = getStatusTheme(task.status);
                  return (
                    <TouchableOpacity
                      style={[styles.statusDropdownPill, { backgroundColor: theme.bg }]}
                      onPress={() => setIsStatusPickerVisible(true)}
                      activeOpacity={0.75}
                      disabled={togglingStatus}
                    >
                      <View style={[styles.statusDot, { backgroundColor: theme.dot }]} />
                      <Text style={[styles.statusDropdownText, { color: theme.text }]}>
                        {theme.label}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={14}
                        color={theme.chevron}
                        style={{ marginLeft: 4 }}
                      />
                    </TouchableOpacity>
                  );
                })()}
              </View>

              {/* Details Row: Assignee & Due Date */}
              <View style={styles.heroDetailsRow}>
                {/* Assignee */}
                <TouchableOpacity
                  style={styles.heroDetailCol}
                  onPress={handleOpenEdit}
                  activeOpacity={0.7}
                >
                  <Avatar
                    name={
                      (task as any).assignees?.[0]?.user?.full_name ||
                      task.assignee?.full_name ||
                      "User"
                    }
                    size={36}
                  />
                  <View style={styles.heroDetailTextCol}>
                    <Text style={styles.heroDetailLabel}>
                      {(task as any).assignees?.length > 1
                        ? `Assignees (${(task as any).assignees.length})`
                        : "Assignee"}
                    </Text>
                    <Text style={styles.heroDetailValue} numberOfLines={1}>
                      {((task as any).assignees && (task as any).assignees.length > 0)
                        ? (task as any).assignees
                            .map((a: any) => a.user?.full_name || a.user?.name || "User")
                            .join(", ")
                        : task.assignee?.full_name || "Unassigned"}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Due Date */}
                <View style={styles.heroDetailCol}>
                  <View style={styles.calendarIconBox}>
                    <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.heroDetailTextCol}>
                    <Text style={styles.heroDetailLabel}>Due Date</Text>
                    <Text style={styles.heroDetailValue} numberOfLines={1}>
                      {task.due_date
                        ? new Date(task.due_date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Sep 30, 2024"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Task Assignment Details (Who assigned, Assignment Date, Exact Time) */}
              <View style={styles.assignmentMetaRow}>
                <View style={styles.assignmentIconBox}>
                  <Ionicons name="person-add-outline" size={16} color={Colors.primary} />
                </View>
                <View style={styles.assignmentTextCol}>
                  <Text style={styles.assignmentMetaLabel}>ASSIGNED BY & CREATION DETAILS</Text>
                  <Text style={styles.assignmentMetaValue}>
                    {(task as any).creator?.full_name || (task as any).creator?.name || "Team Member"}
                    {(task as any).creator?.role ? ` • ${(task as any).creator.role}` : ""}
                  </Text>
                  {task.created_at ? (
                    <View style={styles.assignmentTimeBadge}>
                      <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
                      <Text style={styles.assignmentTimeText}>
                        {(() => {
                          try {
                            const d = new Date(task.created_at);
                            return `${format(d, 'MMM dd, yyyy')} at ${format(d, 'hh:mm:ss a')}`;
                          } catch {
                            return new Date(task.created_at).toLocaleString();
                          }
                        })()}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Action Buttons Row */}
              <View style={styles.heroActionsRow}>
                <TouchableOpacity
                  style={styles.editTaskBtn}
                  onPress={handleOpenEdit}
                  activeOpacity={0.8}
                >
                  <Ionicons name="pencil" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.editTaskBtnText}>Edit Task</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addSubtaskBtn, isMaxDepthReached && { opacity: 0.5 }]}
                  onPress={handleToggleAddSubtask}
                  activeOpacity={0.8}
                  disabled={isMaxDepthReached}
                >
                  <Ionicons name="add" size={18} color="#0F172A" style={{ marginRight: 4 }} />
                  <Text style={styles.addSubtaskBtnText}>Add Subtask</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.moreOptionsBtn}
                  onPress={() => setIsMenuVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color="#0F172A" />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Subtasks Section (Design format matching screenshot) ── */}
            <View style={styles.subtasksCard}>
              <TouchableOpacity
                style={styles.subtasksCardHeader}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setSubtasksExpanded((prev) => !prev);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.subtasksTitleText}>
                  Subtasks {subtasks.length > 0 ? `(${subtasks.length})` : ""}
                </Text>
                <Ionicons
                  name={subtasksExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>

              {/* Subtasks Expanded Body */}
              {subtasksExpanded && (
                <View style={styles.subtasksCardBody}>
                  {/* Inline Composer if adding subtask */}
                  {isAddingSubtask && (
                    <View style={styles.inlineComposer}>
                      <Text style={styles.composerHeader}>New Subtask under "{task.title}"</Text>

                      <TextInput
                        style={styles.composerInput}
                        placeholder="Subtask title..."
                        placeholderTextColor={Colors.textMuted}
                        value={newSubtaskTitle}
                        onChangeText={setNewSubtaskTitle}
                        autoFocus
                      />

                      {/* Priority Selector Pills */}
                      <View style={styles.composerOptionRow}>
                        <Text style={styles.composerOptionLabel}>Priority:</Text>
                        {(["Low", "Medium", "High", "Urgent"] as const).map((p) => (
                          <TouchableOpacity
                            key={p}
                            style={[styles.composerPriorityChip, newSubtaskPriority === p && styles.composerPriorityChipActive]}
                            onPress={() => setNewSubtaskPriority(p)}
                          >
                            <Text style={[styles.composerPriorityText, newSubtaskPriority === p && styles.composerPriorityTextActive]}>
                              {p}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Assignee Selector - Multi-select */}
                      {eligibleAssignees.length > 0 && (
                        <View style={styles.assigneePickerArea}>
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <Text style={styles.composerOptionLabel}>
                              Assign to: {selectedAssigneeIds.length > 0 ? `(${selectedAssigneeIds.length} selected)` : "(Optional)"}
                            </Text>
                            <TouchableOpacity
                              onPress={() => {
                                if (selectedAssigneeIds.length === eligibleAssignees.length) {
                                  setSelectedAssigneeIds([]);
                                } else {
                                  setSelectedAssigneeIds(eligibleAssignees.map((u) => u.id));
                                }
                              }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={{ fontSize: 11, fontFamily: Typography.fontFamily.bold, color: Colors.primary }}>
                                {selectedAssigneeIds.length === eligibleAssignees.length ? "Clear All" : "Select All"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assigneeChipsScroll}>
                            {eligibleAssignees.map((user) => {
                              const isSelected = selectedAssigneeIds.includes(user.id);
                              const displayName = user.full_name || user.name || user.email?.split("@")[0] || "User";
                              return (
                                <TouchableOpacity
                                  key={user.id}
                                  style={[styles.assigneeChip, isSelected && styles.assigneeChipSelected]}
                                  onPress={() => {
                                    setSelectedAssigneeIds((prev) =>
                                      prev.includes(user.id)
                                        ? prev.filter((id) => id !== user.id)
                                        : [...prev, user.id]
                                    );
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <Avatar name={displayName} size={18} />
                                  <Text style={[styles.assigneeChipText, isSelected && styles.assigneeChipTextSelected]}>
                                    {displayName}
                                  </Text>
                                  {isSelected && (
                                    <Ionicons name="checkmark-circle" size={14} color={Colors.primary} style={{ marginLeft: 2 }} />
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      )}

                      {/* Documents / File Attachment Section */}
                      <View style={styles.composerAttachSection}>
                        <View style={styles.composerAttachHeader}>
                          <Text style={styles.composerAttachTitle}>Documents & Attachments</Text>
                          <Text style={styles.composerAttachSize}>
                            {formatFileSize(totalSubtaskAttachmentBytes)} / 20 MB
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.composerUploadBtn}
                          onPress={handlePickSubtaskDocuments}
                          disabled={creatingSubtask}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="cloud-upload-outline" size={18} color={Colors.primary} />
                          <Text style={styles.composerUploadText}>Pick Files (PDF, DOCX, Images, ZIP)</Text>
                        </TouchableOpacity>

                        {subtaskDocuments.length > 0 && (
                          <View style={styles.composerDocList}>
                            {subtaskDocuments.map((doc, dIdx) => (
                              <View key={`doc_${dIdx}`} style={styles.composerDocItem}>
                                <Ionicons name="document-text-outline" size={14} color={Colors.primary} />
                                <Text style={styles.composerDocName} numberOfLines={1}>{doc.name}</Text>
                                <Text style={styles.composerDocSize}>{formatFileSize(doc.size || 0)}</Text>
                                <TouchableOpacity onPress={() => handleRemoveSubtaskDocument(dIdx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>

                      {/* Voice Notes Section */}
                      <View style={styles.composerVoiceSection}>
                        <VoiceNoteRecorder
                          notes={subtaskVoiceNotes}
                          onChange={setSubtaskVoiceNotes}
                          existingAttachmentBytes={totalSubtaskAttachmentBytes}
                          disabled={creatingSubtask}
                        />
                      </View>

                      {/* Upload/Creation Progress Indicator */}
                      {creatingSubtask && subtaskCreationProgress ? (
                        <View style={styles.composerProgressRow}>
                          <ActivityIndicator size="small" color={Colors.primary} />
                          <Text style={styles.composerProgressText}>{subtaskCreationProgress}</Text>
                        </View>
                      ) : null}

                      {/* Submit & Cancel Buttons */}
                      <View style={styles.composerActionRow}>
                        <TouchableOpacity style={styles.composerCancelBtn} onPress={handleToggleAddSubtask}>
                          <Text style={styles.composerCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.composerCreateBtn, creatingSubtask && { opacity: 0.6 }]}
                          onPress={handleCreateSubtask}
                          disabled={creatingSubtask}
                        >
                          {creatingSubtask ? (
                            <ActivityIndicator size="small" color={Colors.textInverse} />
                          ) : (
                            <Text style={styles.composerCreateText}>Create Subtask</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Subtask Tree Rows with visual branch lines (Left Screenshot) */}
                  {subtasks.length > 0 ? (
                    <View style={styles.treeContainer}>
                      {/* Vertical connector guide line */}
                      <View style={styles.treeVerticalGuide} />

                      {subtasks.map((child, cIdx) => {
                        const { letter: childLetter, displayTitle: childDisplayTitle } =
                          getLetterAndTitle(child.title, cIdx, false);

                        return (
                          <View key={child.id || `child_${cIdx}`} style={styles.treeItemRow}>
                            {/* Connector tick with dot on the guide line */}
                            <View style={styles.treeNodeConnector}>
                              <View style={styles.treeNodeDot} />
                              <View style={styles.treeHorizontalBranch} />
                            </View>

                            {/* Subtask Row Card */}
                            <TouchableOpacity
                              style={styles.subtaskRowCard}
                              onPress={() => handleSelectChild(child.id)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.subtaskBadge}>
                                <Text style={styles.subtaskBadgeText}>{childLetter}</Text>
                              </View>
                              <Text style={styles.subtaskRowTitle} numberOfLines={1}>
                                {childDisplayTitle}
                              </Text>
                              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  ) : !isAddingSubtask ? (
                    <View style={styles.emptySubtasksCard}>
                      <Ionicons name="git-network-outline" size={28} color={Colors.textMuted} style={{ marginBottom: 6 }} />
                      <Text style={styles.emptySubtasksText}>No subtasks yet</Text>
                      {!isMaxDepthReached && (
                        <Text style={styles.emptySubtasksHint}>Tap "+ Add Subtask" above to create one</Text>
                      )}
                    </View>
                  ) : null}

                  {/* Depth limit reached warning box (Shown when depth reaches 5) */}
                  {currentDepth >= 5 && (
                    <View style={styles.depthLimitCard}>
                      <Ionicons
                        name="lock-closed-outline"
                        size={22}
                        color="#0284C7"
                        style={{ marginRight: 12, marginTop: 2 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.depthLimitTitle}>
                          Maximum task depth reached (5 levels)
                        </Text>
                        <Text style={styles.depthLimitDesc}>
                          You can create up to 5 levels of task hierarchy ({hierarchyPathString}). Additional subtask levels are not available.
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Task Hierarchy info box (Matching bottom card in screenshot) */}
                  <View style={styles.hierarchyInfoCard}>
                    <Ionicons
                      name="information-circle"
                      size={22}
                      color="#0284C7"
                      style={{ marginRight: 10 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hierarchyInfoTitle}>Task Hierarchy</Text>
                      <Text style={styles.hierarchyInfoSubtitle}>
                        You can create up to 5 levels of subtasks.
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* ── Assignment Details Card ── */}
            <View style={styles.contentCard}>
              <Text style={styles.contentCardTitle}>Assignment Details</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.metaLabel}>Assigned By</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <Avatar
                      name={(task as any).creator?.full_name || "—"}
                      size={20}
                    />
                    <Text style={[styles.assigneeName, { marginLeft: 6, fontSize: 13 }]}>
                      {(task as any).creator?.full_name || "—"}
                    </Text>
                  </View>
                </View>
                {task.created_at && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.metaLabel}>Assigned On</Text>
                    <Text style={[styles.assigneeName, { marginTop: 4, fontSize: 13 }]}>
                      {new Date(task.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                    <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                      {new Date(task.created_at).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </Text>
                  </View>
                )}
              </View>
              {/* Multi-assignee list */}
              {(task as any).assignees && (task as any).assignees.length > 1 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.metaLabel, { marginBottom: 6 }]}>All Assignees</Text>
                  {(task as any).assignees.map((a: any, aIdx: number) => (
                    <View key={a.user?.id || aIdx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <Avatar name={a.user?.full_name || "User"} size={20} />
                      <Text style={[styles.assigneeName, { marginLeft: 8, fontSize: 13 }]}>
                        {a.user?.full_name || "User"}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* ── Task Details / Description ── */}
            {task.description ? (
              <View style={styles.contentCard}>
                <Text style={styles.contentCardTitle}>Description</Text>
                <Text style={styles.descriptionText}>{task.description}</Text>
              </View>
            ) : null}

            {/* ── Voice Notes Section ── */}
            <VoiceNotePlayer
              taskId={task.id}
              taskCreatorId={task.created_by || undefined}
              initialNotes={(task as any).voice_notes || (task as any).native_voice_notes}
            />

            {/* ── Attachments Section ── */}
            {(task as any).files && (task as any).files.length > 0 ? (
              <View style={styles.contentCard}>
                <Text style={styles.contentCardTitle}>Attachments ({(task as any).files.length})</Text>
                {(task as any).files.map((f: any, fIdx: number) => (
                  <TouchableOpacity
                    key={f.id || `file_${fIdx}`}
                    style={styles.fileRow}
                    onPress={() => f.file_url && Linking.openURL(f.file_url).catch(() => {})}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="document-text-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
                    <Text style={styles.fileName} numberOfLines={1}>
                      {f.file_name || "Attachment"}
                    </Text>
                    <Ionicons name="download-outline" size={16} color={Colors.textMuted} style={{ marginLeft: "auto" }} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {/* ── Comments & Activity Section ── */}
            <View style={styles.contentCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={styles.contentCardTitle}>Comments ({comments.length})</Text>
                {loadingComments && <ActivityIndicator size="small" color={Colors.primary} />}
              </View>
              {comments.length > 0 ? (
                comments.map((c, cIdx) => {
                  const isOwn = c.user_id === profile?.id;
                  const isEditing = editingCommentId === c.id;
                  const isDeleting = deletingCommentId === c.id;
                  return (
                    <View key={c.id || `comment_${cIdx}`} style={styles.commentItem}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Text style={styles.commentAuthor}>
                          {c.user?.full_name || "Team Member"}
                        </Text>
                        {isOwn && !isEditing && (
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                              onPress={() => { setEditingCommentId(c.id); setEditCommentText(c.content); }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="pencil-outline" size={14} color={Colors.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDeleteComment(c.id)}
                              disabled={isDeleting}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              {isDeleting
                                ? <ActivityIndicator size="small" color={Colors.danger} />
                                : <Ionicons name="trash-outline" size={14} color={Colors.danger} />}
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                      {isEditing ? (
                        <View style={{ marginTop: 6, gap: 6 }}>
                          <TextInput
                            style={[styles.commentInput, { marginBottom: 0 }]}
                            value={editCommentText}
                            onChangeText={setEditCommentText}
                            autoFocus
                            multiline
                          />
                          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                            <TouchableOpacity
                              onPress={() => { setEditingCommentId(null); setEditCommentText(""); }}
                              style={{ paddingHorizontal: 10, paddingVertical: 4 }}
                            >
                              <Text style={{ fontSize: 12, color: Colors.textSecondary }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleEditComment(c.id)}
                              disabled={savingEditComment || !editCommentText.trim()}
                              style={[styles.commentSendBtn, { paddingHorizontal: 12, paddingVertical: 4 }]}
                            >
                              {savingEditComment
                                ? <ActivityIndicator size="small" color={Colors.textInverse} />
                                : <Text style={{ fontSize: 12, color: Colors.textInverse, fontFamily: Typography.fontFamily.semiBold }}>Save</Text>}
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <View style={{ marginTop: 4 }}>
                          <Text style={styles.commentContent}>{c.content}</Text>
                          {c.created_at && (
                            <Text style={{ fontSize: 10, color: Colors.textMuted, marginTop: 3 }}>
                              {new Date(c.created_at).toLocaleString("en-US", {
                                month: "short", day: "numeric",
                                hour: "2-digit", minute: "2-digit", hour12: true,
                              })}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              ) : (
                <Text style={styles.noCommentsText}>
                  {loadingComments ? "Loading comments..." : "No comments yet on this task."}
                </Text>
              )}

              {/* Inline Comment Composer */}
              <View style={styles.commentInputRow}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Write a comment..."
                  placeholderTextColor={Colors.textMuted}
                  value={newCommentText}
                  onChangeText={setNewCommentText}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.commentSendBtn, !newCommentText.trim() && { opacity: 0.4 }]}
                  onPress={handlePostComment}
                  disabled={postingComment || !newCommentText.trim()}
                >
                  {postingComment ? (
                    <ActivityIndicator size="small" color={Colors.textInverse} />
                  ) : (
                    <Ionicons name="send" size={16} color={Colors.textInverse} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}

        {/* Quick Status Picker Modal */}
        <Modal
          visible={isStatusPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsStatusPickerVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setIsStatusPickerVisible(false)}
          >
            <View style={styles.statusPickerCard}>
              <Text style={styles.statusPickerTitle}>Change Task Status</Text>
              {(["Not Started", "In Progress", "In Review", "Done"] as const).map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[
                    styles.statusPickerOption,
                    task?.status === st && styles.statusPickerOptionActive,
                  ]}
                  onPress={() => handleUpdateStatus(st)}
                >
                  <View style={[styles.statusDot, { backgroundColor: getStatusTheme(st).dot }]} />
                  <Text style={[styles.statusPickerOptionText, task?.status === st && { fontWeight: "700" }]}>
                    {st}
                  </Text>
                  {task?.status === st && (
                    <Ionicons name="checkmark" size={18} color={Colors.primary} style={{ marginLeft: "auto" }} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Edit Task Modal */}
        <Modal
          visible={isEditModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setIsEditModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalOverlay}
          >
            <View style={styles.editTaskCard}>
              <View style={styles.editTaskHeader}>
                <Text style={styles.editTaskTitle}>Edit Task</Text>
                <TouchableOpacity onPress={() => setIsEditModalVisible(false)}>
                  <Ionicons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              <Text style={styles.editFieldLabel}>Task Title</Text>
              <TextInput
                style={styles.editTextInput}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Task Title"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={[styles.editFieldLabel, { marginTop: 12 }]}>Description</Text>
              <TextInput
                style={[styles.editTextInput, { height: 80, textAlignVertical: "top" }]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Task Description..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />

              <Text style={[styles.editFieldLabel, { marginTop: 12 }]}>Priority</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                {(["Low", "Medium", "High", "Urgent"] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.composerPriorityChip,
                      editPriority === p && styles.composerPriorityChipActive,
                    ]}
                    onPress={() => setEditPriority(p)}
                  >
                    <Text
                      style={[
                        styles.composerPriorityText,
                        editPriority === p && styles.composerPriorityTextActive,
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                <Text style={styles.editFieldLabel}>
                  Assign To {editAssigneeIds.length > 0 ? `(${editAssigneeIds.length} selected)` : "(Optional)"}
                </Text>
                {eligibleAssignees.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      if (editAssigneeIds.length === eligibleAssignees.length) {
                        setEditAssigneeIds([]);
                      } else {
                        setEditAssigneeIds(eligibleAssignees.map((u) => u.id));
                      }
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ fontSize: 11, fontFamily: Typography.fontFamily.bold, color: Colors.primary }}>
                      {editAssigneeIds.length === eligibleAssignees.length ? "Clear All" : "Select All"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {eligibleAssignees.length > 0 ? (
                <View style={{ marginTop: 6 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assigneeChipsScroll}>
                    {eligibleAssignees.map((user) => {
                      const isSelected = editAssigneeIds.includes(user.id);
                      const displayName = user.full_name || user.name || user.email?.split("@")[0] || "User";
                      return (
                        <TouchableOpacity
                          key={user.id}
                          style={[styles.assigneeChip, isSelected && styles.assigneeChipSelected]}
                          onPress={() => {
                            setEditAssigneeIds((prev) =>
                              prev.includes(user.id)
                                ? prev.filter((id) => id !== user.id)
                                : [...prev, user.id]
                            );
                          }}
                          activeOpacity={0.7}
                        >
                          <Avatar name={displayName} size={18} />
                          <Text style={[styles.assigneeChipText, isSelected && styles.assigneeChipTextSelected]}>
                            {displayName}
                          </Text>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={14} color={Colors.primary} style={{ marginLeft: 2 }} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.editActionsRow}>
                <TouchableOpacity
                  style={styles.editCancelBtn}
                  onPress={() => setIsEditModalVisible(false)}
                >
                  <Text style={styles.editCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editSaveBtn}
                  onPress={handleSaveEdit}
                  disabled={savingEdit}
                >
                  {savingEdit ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.editSaveText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* 3-Dots Menu Modal */}
        <Modal
          visible={isMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsMenuVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setIsMenuVisible(false)}
          >
            <View style={styles.menuSheetCard}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setIsMenuVisible(false);
                  handleToggleComplete();
                }}
              >
                <Ionicons
                  name={isDone ? "refresh-outline" : "checkmark-circle-outline"}
                  size={20}
                  color={Colors.primary}
                  style={{ marginRight: 12 }}
                />
                <Text style={styles.menuItemText}>{isDone ? "Reopen Task" : "Mark as Completed"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setIsMenuVisible(false);
                  handleOpenEdit();
                }}
              >
                <Ionicons name="pencil-outline" size={20} color={Colors.primary} style={{ marginRight: 12 }} />
                <Text style={styles.menuItemText}>Edit Task</Text>
              </TouchableOpacity>

              {!isMaxDepthReached && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setIsMenuVisible(false);
                    handleToggleAddSubtask();
                  }}
                >
                  <Ionicons name="add-circle-outline" size={20} color={Colors.primary} style={{ marginRight: 12 }} />
                  <Text style={styles.menuItemText}>Add Subtask</Text>
                </TouchableOpacity>
              )}

              {canDelete && (
                <TouchableOpacity
                  style={[styles.menuItem, { borderBottomWidth: 0 }]}
                  onPress={() => {
                    setIsMenuVisible(false);
                    handleDelete();
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.danger} style={{ marginRight: 12 }} />
                  <Text style={[styles.menuItemText, { color: Colors.danger }]}>Delete Task</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === "ios" ? 54 : 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  headerBtn: {
    padding: 6,
  },
  doneBtnText: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  breadcrumbWrapper: {
    flex: 1,
    marginHorizontal: 8,
  },
  breadcrumbScroll: {
    alignItems: "center",
  },
  crumbItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  crumbText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
  },
  crumbTextActive: {
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.semiBold,
  },
  crumbTextInactive: {
    color: Colors.primary,
  },
  crumbSeparator: {
    marginHorizontal: 4,
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  errorSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 20,
    maxWidth: 280,
  },
  primaryActionBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: Layout.radius.md,
  },
  primaryActionBtnText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 14,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  overdueBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: Layout.radius.md,
    padding: 10,
    marginBottom: 16,
    gap: 8,
  },
  overdueBannerText: {
    fontSize: 13,
    color: Colors.danger,
    fontFamily: Typography.fontFamily.medium,
    flex: 1,
  },
  taskCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 16,
  },
  taskTitle: {
    fontSize: 22,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    lineHeight: 28,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusInProgress: {
    backgroundColor: Colors.infoLight,
  },
  statusDone: {
    backgroundColor: Colors.successLight,
  },
  statusText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
  },
  statusTextInProgress: {
    color: Colors.info,
  },
  statusTextDone: {
    color: Colors.success,
  },
  priorityBadge: {
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  dueDateBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dueDateText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textSecondary,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    marginBottom: 16,
  },
  metaCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.medium,
    marginBottom: 4,
  },
  assigneeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  assigneeName: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
  },
  progressText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  completeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: Layout.radius.md,
  },
  completeBtnActive: {
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  completeBtnText: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 13,
  },
  completeBtnTextActive: {
    color: Colors.textSecondary,
  },
  deleteBtn: {
    padding: 10,
    borderRadius: Layout.radius.md,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    alignItems: "center",
    justifyContent: "center",
  },
  hierarchySection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
  },
  depthBadge: {
    fontSize: 11,
    color: Colors.primary,
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    fontFamily: Typography.fontFamily.medium,
  },
  addSubtaskTrigger: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  addSubtaskTriggerActive: {
    borderColor: Colors.danger,
    backgroundColor: "#fef2f2",
  },
  addSubtaskTriggerText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  maxDepthPill: {
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  maxDepthPillText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.medium,
  },
  inlineComposer: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: 12,
  },
  composerHeader: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
    marginBottom: 8,
  },
  composerInput: {
    backgroundColor: Colors.canvas,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  composerOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  composerOptionLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
    marginRight: 4,
  },
  composerPriorityChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.surfaceSecondary,
  },
  composerPriorityChipActive: {
    backgroundColor: Colors.primary,
  },
  composerPriorityText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
  },
  composerPriorityTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.semiBold,
  },
  assigneePickerArea: {
    marginBottom: 12,
  },
  assigneeChipsScroll: {
    flexDirection: "row",
    marginTop: 6,
  },
  assigneeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.canvas,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 6,
  },
  assigneeChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#eff6ff",
  },
  assigneeChipText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontFamily: Typography.fontFamily.medium,
  },
  assigneeChipTextSelected: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.semiBold,
  },
  composerActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  composerCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Layout.radius.sm,
  },
  composerCancelText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Typography.fontFamily.medium,
  },
  composerCreateBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Layout.radius.sm,
  },
  composerCreateText: {
    fontSize: 13,
    color: Colors.textInverse,
    fontFamily: Typography.fontFamily.semiBold,
  },
  composerAttachSection: {
    marginTop: 8,
    marginBottom: 10,
  },
  composerAttachHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  composerAttachTitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textSecondary,
  },
  composerAttachSize: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textMuted,
  },
  composerUploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderStyle: "dashed",
    borderRadius: Layout.radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  composerUploadText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.primary,
  },
  composerDocList: {
    marginTop: 6,
    gap: 4,
  },
  composerDocItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.canvas,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: Layout.radius.xs,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    gap: 6,
  },
  composerDocName: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
    flex: 1,
  },
  composerDocSize: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.regular,
  },
  composerVoiceSection: {
    marginTop: 6,
    marginBottom: 12,
  },
  composerProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
    backgroundColor: "#eff6ff",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Layout.radius.xs,
  },
  composerProgressText: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.primary,
  },
  childListCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: "hidden",
  },
  childRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  childRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  childRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  childTitle: {
    fontSize: 14,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textPrimary,
    flex: 1,
  },
  childTitleDone: {
    textDecorationLine: "line-through",
    color: Colors.textMuted,
  },
  childRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  childCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  childCountText: {
    fontSize: 11,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.semiBold,
  },
  emptySubtasksCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: 20,
    alignItems: "center",
  },
  emptySubtasksText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.textPrimary,
  },
  emptySubtasksHint: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  contentCard: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 16,
  },
  contentCardTitle: {
    fontSize: 15,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  descriptionText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  fileName: {
    fontSize: 13,
    color: Colors.textPrimary,
    flex: 1,
    fontFamily: Typography.fontFamily.medium,
  },
  commentItem: {
    backgroundColor: Colors.canvas,
    padding: 10,
    borderRadius: Layout.radius.sm,
    marginBottom: 8,
  },
  commentAuthor: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
    marginBottom: 2,
  },
  commentContent: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  noCommentsText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 12,
  },
  commentInputRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  commentInput: {
    flex: 1,
    backgroundColor: Colors.canvas,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Layout.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  commentSendBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: Layout.radius.sm,
  },
  // ── Screenshot Format Styles ──
  headerBrandCenter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  brandIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  brandIconText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  brandTitleText: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  taskHeroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EDF2F7",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  heroAvatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#E0EDFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  heroAvatarText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2563EB",
  },
  heroTitleCol: {
    flex: 1,
  },
  heroTaskTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 24,
    marginBottom: 2,
  },
  heroSubtitle: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  statusPillContainer: {
    flexDirection: "row",
    marginBottom: 14,
  },
  statusDropdownPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  statusDropdownText: {
    fontSize: 13,
    fontWeight: "600",
  },
  heroDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  heroDetailCol: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  heroDetailTextCol: {
    marginLeft: 10,
  },
  heroDetailLabel: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
    marginBottom: 1,
  },
  heroDetailValue: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
  },
  calendarIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  assignmentMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  assignmentIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  assignmentTextCol: {
    flex: 1,
  },
  assignmentMetaLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.semiBold,
    color: "#64748B",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  assignmentMetaValue: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.bold,
    color: "#0F172A",
    marginBottom: 4,
  },
  assignmentTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  assignmentTimeText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: "#475569",
  },
  heroActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  editTaskBtn: {
    flex: 1.2,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  editTaskBtnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  addSubtaskBtn: {
    flex: 1.4,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  addSubtaskBtnText: {
    color: "#0F172A",
    fontWeight: "600",
    fontSize: 14,
  },
  moreOptionsBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  subtasksCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EDF2F7",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  subtasksCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  subtasksTitleText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtasksCardBody: {
    marginTop: 14,
  },
  treeContainer: {
    position: "relative",
    paddingLeft: 4,
    marginTop: 8,
  },
  treeVerticalGuide: {
    position: "absolute",
    left: 15,
    top: 14,
    bottom: 24,
    width: 2,
    backgroundColor: "#CBD5E1",
  },
  treeItemRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  treeNodeConnector: {
    width: 30,
    height: 44,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  treeNodeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#94A3B8",
    position: "absolute",
    left: 8,
  },
  treeHorizontalBranch: {
    height: 2,
    width: 14,
    backgroundColor: "#CBD5E1",
    position: "absolute",
    left: 16,
  },
  subtaskRowCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  subtaskBadge: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  subtaskBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
  subtaskRowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    flex: 1,
    marginRight: 8,
  },
  depthLimitCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F0F7FF",
    borderWidth: 1,
    borderColor: "#93C5FD",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  depthLimitTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0369A1",
  },
  depthLimitDesc: {
    fontSize: 12,
    color: "#0284C7",
    marginTop: 4,
    lineHeight: 17,
  },
  hierarchyInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F7FF",
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  hierarchyInfoTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
  },
  hierarchyInfoSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  statusPickerCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
  },
  statusPickerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  statusPickerOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  statusPickerOptionActive: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
  },
  statusPickerOptionText: {
    fontSize: 14,
    color: "#1E293B",
    marginLeft: 8,
  },
  editTaskCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
  },
  editTaskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  editTaskTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  editFieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  editTextInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#0F172A",
    marginTop: 6,
  },
  editActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
  },
  editCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editCancelText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  editSaveBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editSaveText: {
    fontSize: 13,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  menuSheetCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  menuItemText: {
    fontSize: 14,
    color: "#1E293B",
    fontWeight: "500",
  },
});

export default TaskWorkspaceModal;
