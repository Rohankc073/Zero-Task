import AsyncStorage from '@react-native-async-storage/async-storage';
import { TaskPriority } from '../../types';
import * as DocumentPicker from 'expo-document-picker';
import { PendingVoiceNote } from './VoiceNoteService';

export interface TaskDraft {
  id?: string;
  title: string;
  description: string;
  priority: TaskPriority;
  deadline: string | null;
  assigneeIds: string[];
  taskMode?: 'Delegated' | 'Self-Assigned';
  taskScope?: 'General' | 'Department';
  selectedDepartmentId?: string | null;
  selectedCompanyId?: string | null;
  documents?: DocumentPicker.DocumentPickerAsset[];
  pendingVoiceNotes?: PendingVoiceNote[];
  parentTaskId?: string | null;
  parentTitle?: string | null;
  userId: string;
  companyId?: string | null;
  updatedAt: number;
}

export class TaskDraftService {
  /**
   * Generates a deterministic storage key isolated by user and creation context.
   */
  static getStorageKey(userId: string, contextKey: string = 'default'): string {
    return `@zerotask_task_draft_${userId}_${contextKey}`;
  }

  /**
   * Strict zero-draft policy: drafts are NEVER saved or persisted anywhere in the application.
   * If invoked, it ensures any existing draft key is permanently purged from storage.
   */
  static async saveDraft(
    userId: string,
    draftData: Partial<TaskDraft>,
    contextKey: string = 'default'
  ): Promise<void> {
    if (!userId) return;
    try {
      const key = this.getStorageKey(userId, contextKey);
      await AsyncStorage.removeItem(key);
    } catch (err) {
      // silently ignore
    }
  }

  /**
   * Strict zero-draft policy: ALWAYS returns null. Drafts are never restored anywhere in the app.
   * Also cleans up any legacy draft key for this user/context if present.
   */
  static async loadDraft(
    userId: string,
    contextKey: string = 'default',
    expectedCompanyId?: string | null
  ): Promise<TaskDraft | null> {
    if (userId) {
      try {
        const key = this.getStorageKey(userId, contextKey);
        await AsyncStorage.removeItem(key);
      } catch (err) {
        // silently ignore
      }
    }
    return null;
  }

  /**
   * Permanently clears a draft after successful task creation (idempotent).
   */
  static async clearDraft(userId: string, contextKey: string = 'default'): Promise<void> {
    if (!userId) return;
    try {
      const key = this.getStorageKey(userId, contextKey);
      await AsyncStorage.removeItem(key);
    } catch (err) {
      console.warn('[TaskDraftService] Error clearing draft:', err);
    }
  }

  /**
   * Permanently clears all task drafts for all contexts and users from AsyncStorage.
   */
  static async clearAllUserDrafts(userId?: string): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const draftKeys = allKeys.filter((k) => k.startsWith('@zerotask_task_draft_'));
      if (draftKeys.length > 0) {
        await AsyncStorage.multiRemove(draftKeys);
      }
    } catch (err) {
      console.warn('[TaskDraftService] Error clearing all drafts:', err);
    }
  }

  /**
   * Checks if a draft exists for the given user and context.
   * Under strict zero-draft policy, always returns false.
   */
  static async hasDraft(userId: string, contextKey: string = 'default'): Promise<boolean> {
    return false;
  }
}
