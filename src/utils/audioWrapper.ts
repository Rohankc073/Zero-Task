import Constants from 'expo-constants';
import { Platform } from 'react-native';

let ExpoAudio: any = null;

try {
  ExpoAudio = require('expo-audio');
} catch (e) {
  console.warn('[AudioWrapper] expo-audio not available natively:', e);
}

export const RecordingPresets = ExpoAudio?.RecordingPresets || {
  HIGH_QUALITY: {
    extension: '.m4a',
    mimeType: 'audio/m4a',
  },
};

export const AudioModule = {
  requestRecordingPermissionsAsync: async () => {
    if (typeof ExpoAudio?.requestRecordingPermissionsAsync === 'function') {
      try {
        return await ExpoAudio.requestRecordingPermissionsAsync();
      } catch (err) {
        console.warn('[AudioWrapper] requestRecordingPermissionsAsync error:', err);
      }
    }
    if (typeof ExpoAudio?.AudioModule?.requestRecordingPermissionsAsync === 'function') {
      try {
        return await ExpoAudio.AudioModule.requestRecordingPermissionsAsync();
      } catch (err) {
        console.warn('[AudioWrapper] AudioModule.requestRecordingPermissionsAsync error:', err);
      }
    }
    return { granted: true, status: 'granted', expires: 'never', canAskAgain: true };
  },
  getRecordingPermissionsAsync: async () => {
    if (typeof ExpoAudio?.getRecordingPermissionsAsync === 'function') {
      try {
        return await ExpoAudio.getRecordingPermissionsAsync();
      } catch (err) {
        console.warn('[AudioWrapper] getRecordingPermissionsAsync error:', err);
      }
    }
    if (typeof ExpoAudio?.AudioModule?.getRecordingPermissionsAsync === 'function') {
      try {
        return await ExpoAudio.AudioModule.getRecordingPermissionsAsync();
      } catch (err) {
        console.warn('[AudioWrapper] AudioModule.getRecordingPermissionsAsync error:', err);
      }
    }
    return { granted: true, status: 'granted', expires: 'never', canAskAgain: true };
  },
  setAudioModeAsync: async (mode: any) => {
    if (typeof ExpoAudio?.setAudioModeAsync === 'function') {
      try {
        return await ExpoAudio.setAudioModeAsync(mode);
      } catch (err) {
        console.warn('[AudioWrapper] setAudioModeAsync error:', err);
      }
    }
    if (typeof ExpoAudio?.AudioModule?.setAudioModeAsync === 'function') {
      try {
        return await ExpoAudio.AudioModule.setAudioModeAsync(mode);
      } catch (err) {
        console.warn('[AudioWrapper] AudioModule.setAudioModeAsync error:', err);
      }
    }
  },
};

export function useAudioRecorder(preset?: any) {
  if (ExpoAudio?.useAudioRecorder) {
    try {
      return ExpoAudio.useAudioRecorder(preset || RecordingPresets.HIGH_QUALITY);
    } catch (e) {
      console.warn('[AudioWrapper] useAudioRecorder error:', e);
    }
  }
  return {
    isRecording: false,
    uri: null,
    prepareToRecordAsync: async () => {},
    record: async () => {},
    stop: async () => {},
    getStatus: () => ({ url: null }),
  };
}

export function useAudioPlayer(source?: any) {
  if (ExpoAudio?.useAudioPlayer) {
    try {
      return ExpoAudio.useAudioPlayer(source);
    } catch (e) {
      console.warn('[AudioWrapper] useAudioPlayer error:', e);
    }
  }
  return {
    play: () => {},
    pause: () => {},
    seekTo: async () => {},
  };
}

export function useAudioPlayerStatus(player?: any) {
  if (ExpoAudio?.useAudioPlayerStatus && player) {
    try {
      return ExpoAudio.useAudioPlayerStatus(player);
    } catch (e) {
      console.warn('[AudioWrapper] useAudioPlayerStatus error:', e);
    }
  }
  return {
    playing: false,
    didJustFinish: false,
    currentTime: 0,
    duration: 0,
  };
}
