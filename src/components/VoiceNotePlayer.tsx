/**
 * VoiceNotePlayer.tsx
 *
 * Displays and plays stored voice notes for a task in TaskPreviewModal.
 * Fetches note metadata and generates signed playback URLs.
 * Only one note plays at a time.
 * Cleans up audio resources on unmount.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Colors, Typography, Layout } from '../theme/tokens';
import {
  VoiceNote,
  fetchVoiceNotes,
  getSignedPlaybackUrl,
  deleteVoiceNote,
  formatDuration,
  formatDurationLong,
} from '../services/tasks/VoiceNoteService';
import { useAuth } from '../context/AuthContext';
import { isFounder, isSuperAdmin } from '../utils/permissions';

interface VoiceNotePlayerProps {
  taskId: string;
  /** The user ID of the task creator (to show delete to creator only) */
  taskCreatorId?: string;
}

interface PlayerState {
  noteId: string;
  signedUrl: string;
  loadingUrl: boolean;
}

const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({ taskId, taskCreatorId }) => {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlayer, setActivePlayer] = useState<PlayerState | null>(null);

  // The expo-audio player (source changes when activePlayer changes)
  const player = useAudioPlayer(
    activePlayer?.signedUrl ? { uri: activePlayer.signedUrl } : null
  );
  const status = useAudioPlayerStatus(player);

  const canDelete =
    profile?.id === taskCreatorId ||
    isFounder(profile) ||
    isSuperAdmin(profile);

  useEffect(() => {
    if (taskId) {
      loadNotes();
    }
    return () => {
      // Release audio on unmount
      try { player.pause(); } catch {}
    };
  }, [taskId]);

  const loadNotes = async () => {
    setLoading(true);
    const data = await fetchVoiceNotes(taskId);
    setNotes(data);
    setLoading(false);
  };

  const handlePlayPause = async (note: VoiceNote) => {
    if (activePlayer?.noteId === note.id) {
      // Same note: toggle play/pause
      if (status.playing) {
        player.pause();
      } else {
        player.play();
      }
      return;
    }

    // Different note: stop current, load new
    try { player.pause(); } catch {}
    setActivePlayer({ noteId: note.id, signedUrl: '', loadingUrl: true });

    const url = await getSignedPlaybackUrl(note.storagePath);
    if (!url) {
      setActivePlayer(null);
      return;
    }

    setActivePlayer({ noteId: note.id, signedUrl: url, loadingUrl: false });
    // Player will auto-play once source is set via useAudioPlayer
    // We call play() explicitly after a short tick
    setTimeout(() => {
      try { player.play(); } catch {}
    }, 200);
  };

  const handleDelete = async (note: VoiceNote) => {
    const success = await deleteVoiceNote(note.id, note.storagePath);
    if (success) {
      if (activePlayer?.noteId === note.id) {
        try { player.pause(); } catch {}
        setActivePlayer(null);
      }
      setNotes(prev => prev.filter(n => n.id !== note.id));
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={Colors.info} />
        <Text style={styles.loadingText}>Loading voice notes...</Text>
      </View>
    );
  }

  if (notes.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.headerRow}>
        <Ionicons name="mic" size={15} color={Colors.info} />
        <Text style={styles.sectionLabel}>VOICE NOTES</Text>
        <Text style={styles.countBadge}>{notes.length}</Text>
      </View>

      {notes.map((note, index) => {
        const isActive = activePlayer?.noteId === note.id;
        const isPlaying = isActive && status.playing;
        const isLoadingUrl = isActive && activePlayer?.loadingUrl;

        // Progress display
        const currentSec = isActive ? (status.currentTime ?? 0) : 0;
        const totalSec = note.durationSeconds || (isActive ? (status.duration ?? 0) : 0);
        const progressPct = totalSec > 0 ? Math.min(currentSec / totalSec, 1) : 0;

        return (
          <View key={note.id} style={[styles.noteCard, isActive && styles.noteCardActive]}>
            {/* Top row: label + delete */}
            <View style={styles.noteHeader}>
              <Text style={styles.noteName}>{note.displayName}</Text>
              <Text style={styles.noteDuration}>{formatDurationLong(note.durationSeconds)}</Text>
              {canDelete && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(note)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                </TouchableOpacity>
              )}
            </View>

            {/* Player row */}
            <View style={styles.playerRow}>
              {/* Play/Pause button */}
              <TouchableOpacity
                style={[styles.playBtn, isActive && styles.playBtnActive]}
                onPress={() => handlePlayPause(note)}
                activeOpacity={0.8}
              >
                {isLoadingUrl ? (
                  <ActivityIndicator size="small" color={Colors.textInverse} />
                ) : (
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={16}
                    color={isActive ? Colors.textInverse : Colors.info}
                  />
                )}
              </TouchableOpacity>

              {/* Progress bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
                </View>
                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>{formatDuration(currentSec)}</Text>
                  <Text style={styles.timeText}>{formatDuration(totalSec)}</Text>
                </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: Layout.spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Layout.spacing.md,
  },
  loadingText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Layout.spacing.md,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  countBadge: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.bold,
    color: Colors.info,
    backgroundColor: Colors.infoLight,
    borderRadius: Layout.radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  noteCard: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: Layout.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginBottom: 8,
  },
  noteCardActive: {
    backgroundColor: Colors.infoLight,
    borderColor: Colors.info + '50',
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  noteName: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    color: Colors.textPrimary,
    flex: 1,
  },
  noteDuration: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  deleteBtn: {
    padding: 4,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.info + '40',
  },
  playBtnActive: {
    backgroundColor: Colors.info,
    borderColor: Colors.info,
  },
  progressContainer: {
    flex: 1,
    gap: 5,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.borderSubtle,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.info,
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.textMuted,
  },
});

export default VoiceNotePlayer;
