import { apiClient } from '../api/apiClient';
import { getApiUrl } from '../../adapter/config';
import { readFileAsArrayBuffer } from '../../utils/attachmentPipeline';
import * as FileSystem from 'expo-file-system/legacy';

export interface VoiceNote {
  id: string;
  taskId: string;
  creatorId: string;
  storagePath: string;
  displayName: string;
  noteNumber: number;
  durationSeconds: number;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface PendingVoiceNote {
  /** Local URI of the recorded audio file */
  uri: string;
  /** Sequential label, e.g. "Note 1" */
  displayName: string;
  /** 1-based index within this task */
  noteNumber: number;
  durationSeconds: number;
  /** File size in bytes (may be 0 if unknown before upload) */
  fileSize: number;
  mimeType: string;
}

export interface VoiceUploadResult {
  uploaded: number;
  failed: number;
  errors: string[];
  uploadedNotes: PendingVoiceNote[];
  failedNotes: PendingVoiceNote[];
}

export const AUDIO_MIME_TYPE = 'audio/m4a';
export const AUDIO_BUCKET = 'task-audio';

/**
 * Uploads all pending voice notes for a newly created task.
 * Canonical runtime: FastAPI -> MinIO (no Supabase).
 * Returns { uploaded, failed, errors, uploadedNotes, failedNotes }.
 * Voice notes are optional so a failed upload does NOT roll back the task.
 */
export async function uploadPendingVoiceNotes(
  taskId: string,
  creatorId: string,
  pendingNotes: PendingVoiceNote[]
): Promise<VoiceUploadResult> {
  let uploaded = 0;
  let failed = 0;
  const errors: string[] = [];
  const uploadedNotes: PendingVoiceNote[] = [];
  const failedNotes: PendingVoiceNote[] = [];

  for (const note of pendingNotes) {
    try {
      const storagePath = `${creatorId}/${taskId}/${Date.now()}_note${note.noteNumber}.m4a`;

      // Determine accurate file size if missing
      let fileSize = note.fileSize || 0;
      if (fileSize === 0) {
        try {
          const info = await FileSystem.getInfoAsync(note.uri);
          if (info.exists && 'size' in info) {
            fileSize = info.size ?? 0;
          }
        } catch {}
      }

      // 1. Upload audio file to MinIO via FastAPI /storage/upload (native FileSystem streaming)
      const uploadRes = await apiClient.uploadFileUri(
        AUDIO_BUCKET,
        storagePath,
        note.uri,
        note.mimeType || AUDIO_MIME_TYPE,
        `note${note.noteNumber}.m4a`
      );

      if (uploadRes.error) {
        throw new Error(uploadRes.error.message);
      }

      // 2. Insert voice note metadata via FastAPI POST /tasks/{id}/voice-notes
      const metaRes = await apiClient.post(`/tasks/${taskId}/voice-notes`, {
        task_id: taskId,
        creator_id: creatorId,
        storage_path: storagePath,
        display_name: note.displayName,
        note_number: note.noteNumber,
        duration_seconds: note.durationSeconds,
        mime_type: note.mimeType || AUDIO_MIME_TYPE,
        file_size: fileSize,
      });

      if (metaRes.error) {
        // Attempt to clean up the orphaned storage object
        await apiClient.post('/storage/delete', { bucket: AUDIO_BUCKET, paths: [storagePath] });
        throw new Error(metaRes.error.message);
      }

      uploaded++;
      uploadedNotes.push(note);
    } catch (err: any) {
      failed++;
      errors.push(`Note ${note.noteNumber}: ${err.message}`);
      failedNotes.push(note);
      console.warn(`[VoiceNoteService] Failed to upload note ${note.noteNumber}:`, err);
    }
  }

  return { uploaded, failed, errors, uploadedNotes, failedNotes };
}

/**
 * Fetches all voice notes for a task, ordered by note_number.
 * Canonical runtime: FastAPI GET /tasks/{id}/voice-notes (no Supabase).
 */
export async function fetchVoiceNotes(taskId: string): Promise<VoiceNote[]> {
  const res = await apiClient.get<any[]>(`/tasks/${taskId}/voice-notes`);
  if (res.error) {
    console.warn('[VoiceNoteService] fetchVoiceNotes notice:', res.error.message);
    return [];
  }

  return (res.data || []).map((row: any) => ({
    id: row.id,
    taskId: row.task_id,
    creatorId: row.creator_id,
    storagePath: row.storage_path,
    displayName: row.display_name,
    noteNumber: row.note_number,
    durationSeconds: row.duration_seconds ?? 0,
    mimeType: row.mime_type,
    fileSize: row.file_size ?? 0,
    createdAt: row.created_at,
  }));
}

/**
 * Generates a signed/served playback URL for a voice note via FastAPI.
 * The FastAPI /storage/signed-url endpoint generates a presigned MinIO URL (1 hour TTL).
 */
export async function getSignedPlaybackUrl(storagePath: string): Promise<string | null> {
  if (!storagePath) {
    return null;
  }
  try {
    const qs = `bucket=${encodeURIComponent(AUDIO_BUCKET)}&storage_path=${encodeURIComponent(storagePath)}&expires_in=3600`;
    const res = await apiClient.get<{ url?: string; signed_url?: string }>(`/storage/signed-url?${qs}`);

    if (res.error) {
      console.warn('[VoiceNoteService] getSignedPlaybackUrl notice:', res.error.message);
      return null;
    }

    const rawUrl = res.data?.signed_url || res.data?.url;
    if (!rawUrl) {
      console.warn('[VoiceNoteService] getSignedPlaybackUrl: no URL returned for path', storagePath);
      return null;
    }

    // If already absolute URL, return directly
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      return rawUrl;
    }

    const apiUrl = getApiUrl().replace(/\/+$/, ''); // e.g. http://192.168.29.169:8088/api/v1
    const hostBase = apiUrl.replace(/\/api\/v1\/?$/, ''); // e.g. http://192.168.29.169:8088

    if (rawUrl.startsWith('/api/v1')) {
      return `${hostBase}${rawUrl}`;
    }
    if (rawUrl.startsWith('/storage')) {
      return `${apiUrl}${rawUrl}`;
    }
    return `${apiUrl}/${rawUrl.replace(/^\/+/, '')}`;
  } catch (err: any) {
    console.warn('[VoiceNoteService] getSignedPlaybackUrl exception:', err?.message || err);
    return null;
  }
}

/**
 * Deletes a voice note (metadata + storage object) via FastAPI.
 * Canonical runtime: FastAPI -> PostgreSQL + MinIO (no Supabase).
 */
export async function deleteVoiceNote(noteId: string, storagePath: string): Promise<boolean> {
  try {
    // Delete metadata via FastAPI
    const metaRes = await apiClient.delete(`/tasks/voice-notes/${noteId}`);
    if (metaRes.error) throw new Error(metaRes.error.message);

    // Delete storage object via FastAPI /storage/delete
    await apiClient.post('/storage/delete', { bucket: AUDIO_BUCKET, paths: [storagePath] });
    return true;
  } catch (err: any) {
    console.error('[VoiceNoteService] deleteVoiceNote error:', err);
    return false;
  }
}

/**
 * Formats seconds into MM:SS display string.
 */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Formats seconds into human-readable string, e.g. "1 min 05 sec" or "42 sec".
 */
export function formatDurationLong(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} sec`;
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return secs > 0 ? `${mins} min ${String(secs).padStart(2, '0')} sec` : `${mins} min`;
}
