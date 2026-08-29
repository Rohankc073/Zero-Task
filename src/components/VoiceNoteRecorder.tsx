/**
 * VoiceNoteRecorder.tsx
 *
 * Renders the optional "Voice Notes" section inside CreateTaskModal.
 * Allows task creators to record, preview, and manage multiple voice notes
 * before final task submission.
 *
 * Uses expo-audio for recording. All notes are kept in local state until
 * the parent calls uploadPendingVoiceNotes() after task creation.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioRecorder, RecordingPresets, useAudioPlayer, AudioModule } from 'expo-audio';
import { Colors, Typography, Layout } from '../theme/tokens';
import { PendingVoiceNote, formatDuration } from '../services/tasks/VoiceNoteService';
import { MAX_TASK_ATTACHMENT_BYTES } from '../utils/attachmentPipeline';
import * as FileSystem from 'expo-file-system/legacy';

interface VoiceNoteRecorderProps {
  /** Current list of pending notes */
  notes: PendingVoiceNote[];
  /** Called when notes change (add/remove) */
  onChange: (notes: PendingVoiceNote[]) => void;
  /** Combined bytes already used by document attachments */
  existingAttachmentBytes: number;
  /** Whether the recorder is disabled (e.g. task is submitting) */
  disabled?: boolean;
}

type RecordingState = 'idle' | 'requesting' | 'recording' | 'stopped';

const VoiceNoteRecorder: React.FC<VoiceNoteRecorderProps> = ({
  notes,
  onChange,
  existingAttachmentBytes,
  disabled = false,
}) => {
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // State for the note that has just been recorded and is awaiting user action
  const [previewNote, setPreviewNote] = useState<{
    uri: string;
    durationSeconds: number;
  } | null>(null);

  // State for which note is currently being previewed (playback)
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [playingPreview, setPlayingPreview] = useState(false);

  // expo-audio player for previewing just-recorded note
  const [previewPlayerUri, setPreviewPlayerUri] = useState<string | null>(null);
  const previewPlayer = useAudioPlayer(previewPlayerUri ? { uri: previewPlayerUri } : null);

  // expo-audio player for previewing already-added notes
  const [listPlayerUri, setListPlayerUri] = useState<string | null>(null);
  const listPlayer = useAudioPlayer(listPlayerUri ? { uri: listPlayerUri } : null);

  // Total size tracking
  const totalVoiceBytes = notes.reduce((sum, n) => sum + (n.fileSize || 0), 0);
  const combinedBytes = existingAttachmentBytes + totalVoiceBytes;

  // Timer for elapsed recording time
  const startTimer = useCallback(() => {
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
      // Release audio resources on unmount
      try {
        if (audioRecorder.isRecording) {
          audioRecorder.stop();
        }
      } catch {}
    };
  }, []);

  const handleStartRecording = async () => {
    if (disabled) return;

    // Prevent too many notes
    if (notes.length >= 10) {
      Alert.alert('Limit Reached', 'A task can have at most 10 voice notes.');
      return;
    }

    setRecordingState('requesting');

    try {
      // Request permission
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setRecordingState('idle');
        Alert.alert(
          'Microphone Permission Required',
          'ZeroTask needs microphone access to record voice notes. You can still create the task without a voice note.\n\nGo to Settings → Apps → ZeroTask → Permissions to enable the microphone.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Configure Audio Mode & Prepare Recorder
      try {
        await AudioModule.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      } catch (modeErr) {
        console.warn('Set audio mode warning:', modeErr);
      }

      await audioRecorder.prepareToRecordAsync();
      setRecordingState('recording');
      startTimer();
      await audioRecorder.record();
    } catch (err: any) {
      setRecordingState('idle');
      stopTimer();
      Alert.alert('Recording Error', err.message || 'Failed to start recording.');
    }
  };

  const handleStopRecording = async () => {
    if (recordingState !== 'recording') return;
    stopTimer();

    try {
      await audioRecorder.stop();
      const status = audioRecorder.getStatus();
      const uri = audioRecorder.uri || status?.url;
      if (!uri) {
        setRecordingState('idle');
        Alert.alert('Recording Error', 'Recording failed to save.');
        return;
      }

      setRecordingState('stopped');
      setPreviewNote({
        uri,
        durationSeconds: elapsedSeconds,
      });
      setElapsedSeconds(0);

      // Load preview player
      setPreviewPlayerUri(uri);
    } catch (err: any) {
      setRecordingState('idle');
      Alert.alert('Recording Error', err.message || 'Failed to stop recording.');
    }
  };

  const handleDiscardPreview = () => {
    setPreviewNote(null);
    setRecordingState('idle');
    setPlayingPreview(false);
    setPreviewPlayerUri(null);
  };

  const handleAcceptPreview = async () => {
    if (!previewNote) return;

    // Check combined size limit
    let fileSize = 0;
    try {
      const info = await FileSystem.getInfoAsync(previewNote.uri);
      if (info.exists && 'size' in info) {
        fileSize = info.size ?? 0;
      }
    } catch {}

    if (combinedBytes + fileSize > MAX_TASK_ATTACHMENT_BYTES) {
      Alert.alert(
        'Size Limit Exceeded',
        `Adding this recording would exceed the 20 MB combined attachment limit.\nCurrent total: ${(combinedBytes / 1048576).toFixed(1)} MB`
      );
      return;
    }

    const newNoteNumber = notes.length + 1;
    const newNote: PendingVoiceNote = {
      uri: previewNote.uri,
      displayName: `Note ${newNoteNumber}`,
      noteNumber: newNoteNumber,
      durationSeconds: previewNote.durationSeconds,
      fileSize,
      mimeType: 'audio/m4a',
    };

    onChange([...notes, newNote]);
    setPreviewNote(null);
    setRecordingState('idle');
    setPlayingPreview(false);
    setPreviewPlayerUri(null);
  };

  const handleRemoveNote = (index: number) => {
    const updated = notes.filter((_, i) => i !== index);
    // Renumber remaining notes
    const renumbered = updated.map((n, i) => ({
      ...n,
      noteNumber: i + 1,
      displayName: `Note ${i + 1}`,
    }));
    onChange(renumbered);
    if (playingIndex === index) {
      setPlayingIndex(null);
      setListPlayerUri(null);
    }
  };

  const handlePlayListNote = (index: number, uri: string) => {
    if (playingIndex === index) {
      // Toggle pause/play
      if (listPlayer.playing) {
        listPlayer.pause();
      } else {
        listPlayer.play();
      }
      return;
    }
    // Switch to different note: stop current
    setPlayingIndex(index);
    setListPlayerUri(uri);
  };

  const handlePlayPreview = () => {
    if (previewPlayer.playing) {
      previewPlayer.pause();
      setPlayingPreview(false);
    } else {
      previewPlayer.play();
      setPlayingPreview(true);
    }
  };

  const combinedMB = (combinedBytes / 1048576).toFixed(1);
  const voiceMB = (totalVoiceBytes / 1048576).toFixed(1);

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="mic-outline" size={16} color={Colors.info} />
          <Text style={styles.sectionLabel}>VOICE NOTES</Text>
          <View style={styles.optionalBadge}>
            <Text style={styles.optionalText}>OPTIONAL</Text>
          </View>
        </View>
        {notes.length > 0 && (
          <Text style={styles.sizeHint}>{voiceMB} MB</Text>
        )}
      </View>

      {/* Existing pending notes list */}
      {notes.length > 0 && (
        <View style={styles.noteList}>
          {notes.map((note, index) => (
            <View key={index} style={styles.noteItem}>
              <View style={styles.noteLeft}>
                <Ionicons name="mic" size={18} color={Colors.info} />
                <View style={styles.noteInfo}>
                  <Text style={styles.noteName}>{note.displayName}</Text>
                  <Text style={styles.noteDuration}>{formatDuration(note.durationSeconds)}</Text>
                </View>
              </View>
              <View style={styles.noteActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handlePlayListNote(index, note.uri)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={playingIndex === index && listPlayer.playing ? 'pause' : 'play'}
                    size={18}
                    color={Colors.info}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleRemoveNote(index)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Preview state: note recorded, awaiting accept/discard */}
      {previewNote && recordingState === 'stopped' && (
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={styles.previewTitle}>
              Note {notes.length + 1} — {formatDuration(previewNote.durationSeconds)}
            </Text>
          </View>
          <Text style={styles.previewHint}>Preview before adding:</Text>
          <View style={styles.previewActions}>
            <TouchableOpacity style={styles.previewPlayBtn} onPress={handlePlayPreview} activeOpacity={0.8}>
              <Ionicons name={playingPreview ? 'pause' : 'play'} size={18} color={Colors.info} />
              <Text style={styles.previewPlayText}>{playingPreview ? 'Pause' : 'Play'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.previewDiscardBtn} onPress={handleDiscardPreview} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              <Text style={styles.previewDiscardText}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.previewAcceptBtn} onPress={handleAcceptPreview} activeOpacity={0.8}>
              <Ionicons name="add-circle" size={16} color={Colors.textInverse} />
              <Text style={styles.previewAcceptText}>Add Note</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Recording active state */}
      {recordingState === 'recording' && (
        <View style={styles.recordingCard}>
          <View style={styles.recordingIndicatorRow}>
            <View style={styles.redDot} />
            <Text style={styles.recordingLabel}>Recording...</Text>
            <Text style={styles.elapsedText}>{formatDuration(elapsedSeconds)}</Text>
          </View>
          <TouchableOpacity style={styles.stopBtn} onPress={handleStopRecording} activeOpacity={0.8}>
            <Ionicons name="stop" size={18} color={Colors.textInverse} />
            <Text style={styles.stopBtnText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Requesting permission loading */}
      {recordingState === 'requesting' && (
        <View style={styles.requestingCard}>
          <ActivityIndicator size="small" color={Colors.info} />
          <Text style={styles.requestingText}>Requesting microphone access...</Text>
        </View>
      )}

      {/* Record button (idle state only) */}
      {recordingState === 'idle' && !previewNote && (
        <TouchableOpacity
          style={[styles.recordBtn, disabled && styles.recordBtnDisabled]}
          onPress={handleStartRecording}
          disabled={disabled}
          activeOpacity={0.8}
        >
          <Ionicons name="mic-outline" size={18} color={disabled ? Colors.textMuted : Colors.info} />
          <Text style={[styles.recordBtnText, disabled && { color: Colors.textMuted }]}>
            + Record Voice Note
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Layout.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Layout.spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  optionalBadge: {
    backgroundColor: Colors.infoLight,
    borderRadius: Layout.radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  optionalText: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.info,
    letterSpacing: 0.5,
  },
  sizeHint: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
  noteList: {
    marginBottom: Layout.spacing.sm,
    gap: 6,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.infoLight,
    borderRadius: Layout.radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.info + '30',
  },
  noteLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  noteInfo: {
    flex: 1,
  },
  noteName: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  noteDuration: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  noteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: {
    padding: 8,
    borderRadius: Layout.radius.sm,
  },
  // Preview card (after recording stops, before user accepts/discards)
  previewCard: {
    backgroundColor: Colors.successLight,
    borderRadius: Layout.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.success + '40',
    marginBottom: Layout.spacing.sm,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  previewTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
  },
  previewHint: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 8,
  },
  previewPlayBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    backgroundColor: Colors.infoLight,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.info + '40',
  },
  previewPlayText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 13,
    color: Colors.info,
  },
  previewDiscardBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    backgroundColor: Colors.dangerLight,
    borderRadius: Layout.radius.sm,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  previewDiscardText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 13,
    color: Colors.danger,
  },
  previewAcceptBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    backgroundColor: Colors.info,
    borderRadius: Layout.radius.sm,
  },
  previewAcceptText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 13,
    color: Colors.textInverse,
  },
  // Active recording card
  recordingCard: {
    backgroundColor: Colors.dangerLight,
    borderRadius: Layout.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.danger + '40',
    marginBottom: Layout.spacing.sm,
    gap: 10,
  },
  recordingIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  redDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.danger,
  },
  recordingLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.danger,
    flex: 1,
  },
  elapsedText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: 16,
    color: Colors.danger,
    letterSpacing: 1,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: Colors.danger,
    borderRadius: Layout.radius.sm,
  },
  stopBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textInverse,
  },
  // Requesting permission state
  requestingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    backgroundColor: Colors.infoLight,
    borderRadius: Layout.radius.md,
    borderWidth: 1,
    borderColor: Colors.info + '30',
    marginBottom: Layout.spacing.sm,
  },
  requestingText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.sm,
    color: Colors.info,
  },
  // Idle record button
  recordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.info + '50',
    borderStyle: 'dashed',
    borderRadius: Layout.radius.sm,
  },
  recordBtnDisabled: {
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.surfaceSubtle,
  },
  recordBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    color: Colors.info,
  },
});

export default VoiceNoteRecorder;
