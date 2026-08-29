import { supabase } from '../../lib/supabase';
import { readFileAsArrayBuffer } from '../../utils/attachmentPipeline';

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

export const AUDIO_MIME_TYPE = 'audio/m4a';
export const AUDIO_BUCKET = 'task-audio';

/**
 * Uploads all pending voice notes for a newly created task.
 * Returns { uploaded, failed } arrays.
 * Voice notes are optional so a failed upload does NOT roll back the task.
 */
export async function uploadPendingVoiceNotes(
  taskId: string,
  creatorId: string,
  pendingNotes: PendingVoiceNote[]
): Promise<{ uploaded: number; failed: number; errors: string[] }> {
  let uploaded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const note of pendingNotes) {
    try {
      const storagePath = `${creatorId}/${taskId}/${Date.now()}_note${note.noteNumber}.m4a`;

      // Read and upload audio binary
      const arrayBuffer = await readFileAsArrayBuffer(note.uri);
      const { error: uploadError } = await supabase.storage
        .from(AUDIO_BUCKET)
        .upload(storagePath, arrayBuffer, {
          contentType: note.mimeType || AUDIO_MIME_TYPE,
          upsert: false,
        });

      if (uploadError) throw new Error(uploadError.message);

      // Insert metadata row
      const { error: dbError } = await supabase.from('task_voice_notes').insert({
        task_id: taskId,
        creator_id: creatorId,
        storage_path: storagePath,
        display_name: note.displayName,
        note_number: note.noteNumber,
        duration_seconds: note.durationSeconds,
        mime_type: note.mimeType || AUDIO_MIME_TYPE,
        file_size: note.fileSize,
      });

      if (dbError) {
        // Attempt cleanup of the orphaned storage object
        await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]);
        throw new Error(dbError.message);
      }

      uploaded++;
    } catch (err: any) {
      failed++;
      errors.push(`Note ${note.noteNumber}: ${err.message}`);
      console.warn(`[VoiceNoteService] Failed to upload note ${note.noteNumber}:`, err);
    }
  }

  return { uploaded, failed, errors };
}

/**
 * Fetches all voice notes for a task, ordered by note_number.
 */
export async function fetchVoiceNotes(taskId: string): Promise<VoiceNote[]> {
  const { data, error } = await supabase
    .from('task_voice_notes')
    .select('*')
    .eq('task_id', taskId)
    .order('note_number', { ascending: true });

  if (error) {
    console.warn('[VoiceNoteService] fetchVoiceNotes notice:', error.message);
    return [];
  }

  return (data || []).map(row => ({
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
 * Generates a signed playback URL for a voice note (1 hour TTL).
 */
export async function getSignedPlaybackUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(storagePath, 3600); // 1 hour

  if (error || !data?.signedUrl) {
    console.error('[VoiceNoteService] getSignedPlaybackUrl error:', error);
    return null;
  }

  return data.signedUrl;
}

/**
 * Deletes a voice note (metadata + storage object).
 */
export async function deleteVoiceNote(noteId: string, storagePath: string): Promise<boolean> {
  try {
    // Delete metadata first
    const { error: dbError } = await supabase
      .from('task_voice_notes')
      .delete()
      .eq('id', noteId);

    if (dbError) throw dbError;

    // Delete storage object
    await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]);
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
