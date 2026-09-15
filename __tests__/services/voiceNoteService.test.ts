import { 
  uploadPendingVoiceNotes, 
  fetchVoiceNotes, 
  getSignedPlaybackUrl, 
  deleteVoiceNote,
  PendingVoiceNote 
} from '../../src/services/tasks/VoiceNoteService';
import { apiClient } from '../../src/services/api/apiClient';
import { TaskDraftService } from '../../src/services/tasks/TaskDraftService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock FileSystem
jest.mock('expo-file-system', () => ({
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 32768 }),
  uploadAsync: jest.fn().mockResolvedValue({ status: 200, body: JSON.stringify({ success: true }) }),
  FileSystemUploadType: {
    BINARY_CONTENT: 0,
    MULTIPART: 1,
  },
}));

// Mock AudioModule
jest.mock('../../src/utils/audioWrapper', () => ({
  AudioModule: {
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  },
  useAudioPlayer: jest.fn().mockReturnValue({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: jest.fn().mockReturnValue({ playing: false, currentTime: 0, duration: 10, didJustFinish: false }),
}));

describe('VoiceNoteService - Production Upload, Storage & Playback Pipeline', () => {
  const mockTaskId = 'task-voice-test-1111';
  const mockUserId = 'user-creator-9999';

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  test('1. Successful single voice note upload persists to backend and returns uploaded status', async () => {
    jest.spyOn(apiClient, 'uploadFileUri').mockResolvedValue({
      data: { storage_path: `voice-notes/${mockTaskId}/note_1.m4a` },
      error: null,
    });

    jest.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        id: 'voice-row-1',
        task_id: mockTaskId,
        creator_id: mockUserId,
        storage_path: `voice-notes/${mockTaskId}/note_1.m4a`,
        display_name: 'Voice Note 1',
        duration_seconds: 12,
        mime_type: 'audio/mp4',
        file_size: 32768,
      },
      error: null,
    });

    const pendingNotes: PendingVoiceNote[] = [{
      uri: 'file:///data/user/0/com.zerotask.app/cache/Audio/rec_1.m4a',
      durationSeconds: 12,
      displayName: 'Voice Note 1',
      noteNumber: 1,
      fileSize: 32768,
      mimeType: 'audio/m4a',
    }];

    const result = await uploadPendingVoiceNotes(mockTaskId, mockUserId, pendingNotes);

    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.uploadedNotes.length).toBe(1);
    expect(result.failedNotes.length).toBe(0);
    expect(apiClient.uploadFileUri).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  test('2. Multiple voice notes upload sequentially and all persist to task_voice_notes', async () => {
    jest.spyOn(apiClient, 'uploadFileUri').mockResolvedValue({
      data: { storage_path: 'ok' },
      error: null,
    });

    jest.spyOn(apiClient, 'post').mockResolvedValue({
      data: { id: 'voice-row' },
      error: null,
    });

    const pendingNotes: PendingVoiceNote[] = [
      {
        uri: 'file:///cache/rec_1.m4a',
        durationSeconds: 10,
        displayName: 'Voice Note 1',
        noteNumber: 1,
        fileSize: 20000,
        mimeType: 'audio/m4a',
      },
      {
        uri: 'file:///cache/rec_2.m4a',
        durationSeconds: 25,
        displayName: 'Voice Note 2',
        noteNumber: 2,
        fileSize: 45000,
        mimeType: 'audio/m4a',
      },
    ];

    const result = await uploadPendingVoiceNotes(mockTaskId, mockUserId, pendingNotes);

    expect(result.uploaded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.uploadedNotes.length).toBe(2);
    expect(apiClient.uploadFileUri).toHaveBeenCalledTimes(2);
    expect(apiClient.post).toHaveBeenCalledTimes(2);
  });

  test('3. Partial failure isolates failed note without losing or dropping successful notes', async () => {
    let callCount = 0;
    jest.spyOn(apiClient, 'uploadFileUri').mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        return { data: null, error: { message: 'Network timeout during upload' } };
      }
      return { data: { storage_path: 'ok' }, error: null };
    });

    jest.spyOn(apiClient, 'post').mockResolvedValue({
      data: { id: 'voice-row' },
      error: null,
    });

    const pendingNotes: PendingVoiceNote[] = [
      {
        uri: 'file:///cache/note_success.m4a',
        durationSeconds: 8,
        displayName: 'Voice Note 1',
        noteNumber: 1,
        fileSize: 15000,
        mimeType: 'audio/m4a',
      },
      {
        uri: 'file:///cache/note_fail.m4a',
        durationSeconds: 30,
        displayName: 'Voice Note 2',
        noteNumber: 2,
        fileSize: 60000,
        mimeType: 'audio/m4a',
      },
    ];

    const result = await uploadPendingVoiceNotes(mockTaskId, mockUserId, pendingNotes);

    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.uploadedNotes.length).toBe(1);
    expect(result.failedNotes.length).toBe(1);
    expect(result.failedNotes[0].displayName).toBe('Voice Note 2');
  });

  test('4. Task draft preserves failed voice notes for re-attachment instead of silent deletion', async () => {
    const failedNote: PendingVoiceNote = {
      uri: 'file:///cache/note_fail.m4a',
      durationSeconds: 30,
      displayName: 'Voice Note 2',
      noteNumber: 2,
      fileSize: 60000,
      mimeType: 'audio/m4a',
    };

    // User draft with failed note retained
    await TaskDraftService.saveDraft(
      mockUserId,
      {
        title: 'Task created with warning',
        pendingVoiceNotes: [failedNote],
      },
      'create_tab'
    );

    const draft = await TaskDraftService.loadDraft(mockUserId, 'create_tab');
    expect(draft).not.toBeNull();
    expect(draft?.pendingVoiceNotes?.length).toBe(1);
    expect(draft?.pendingVoiceNotes?.[0].uri).toBe('file:///cache/note_fail.m4a');
  });

  test('5. getSignedPlaybackUrl generates authenticated direct streaming endpoint', async () => {
    jest.spyOn(apiClient, 'get').mockResolvedValue({
      data: { signed_url: 'https://api.zerotask.com/storage/download?bucket=task-audio&storage_path=voice-notes/123/note.m4a&token=jwt.sig' },
      error: null,
    });

    const url = await getSignedPlaybackUrl('voice-notes/123/note.m4a');
    expect(url).toContain('/storage/download');
    expect(url).toContain('bucket=task-audio');
  });

  test('6. deleteVoiceNote calls backend delete API with task id and note id', async () => {
    jest.spyOn(apiClient, 'delete').mockResolvedValue({
      data: { success: true },
      error: null,
    });
    jest.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true },
      error: null,
    });

    const success = await deleteVoiceNote('voice-row-1', 'voice-notes/123/note.m4a');
    expect(success).toBe(true);
    expect(apiClient.delete).toHaveBeenCalledWith('/tasks/voice-notes/voice-row-1');
    expect(apiClient.post).toHaveBeenCalledWith('/storage/delete', {
      bucket: 'task-audio',
      paths: ['voice-notes/123/note.m4a'],
    });
  });
});
