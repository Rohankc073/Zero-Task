import { Platform } from 'react-native';

export type BackendType = 'self_hosted' | 'supabase';

export const getBackendType = (): BackendType => {
  return 'self_hosted';
};

export const isSelfHosted = (): boolean => {
  return true;
};

/**
 * Safely reads environment variables dynamically without babel compile-time inlining.
 */
const readEnv = (key: string): string | undefined => {
  try {
    return process.env[key];
  } catch {
    return undefined;
  }
};

/**
 * Returns host-aware default URL for local development:
 * On Android Emulator: 10.0.2.2 maps to host machine localhost
 * On iOS Simulator / Web: localhost
 */
const getDefaultHost = (): string => {
  try {
    if (typeof Platform !== 'undefined' && Platform?.OS === 'android') {
      return '10.0.2.2';
    }
  } catch {}
  return 'localhost';
};

export const getApiUrl = (): string => {
  const custom = readEnv('EXPO_PUBLIC_API_URL');
  if (custom) {
    return custom.replace(/\/+$/, '');
  }
  return `http://${getDefaultHost()}:8088/api/v1`;
};

export const getWsUrl = (): string => {
  const custom = readEnv('EXPO_PUBLIC_WS_URL');
  if (custom) {
    return custom.replace(/\/+$/, '');
  }
  return `ws://${getDefaultHost()}:8088/ws`;
};

export const getStorageUrl = (): string => {
  const custom = readEnv('EXPO_PUBLIC_STORAGE_URL');
  if (custom) {
    return custom.replace(/\/+$/, '');
  }
  return `http://${getDefaultHost()}:9000`;
};
