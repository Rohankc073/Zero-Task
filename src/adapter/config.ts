import { Platform } from 'react-native';

export type BackendType = 'supabase' | 'self_hosted';

let runtimeBackendOverride: BackendType | null = null;

/**
 * Allows runtime switching of active backend (useful for Staging / QA testing).
 */
export const setBackendOverride = (type: BackendType | null): void => {
  runtimeBackendOverride = type;
};

export const getBackendOverride = (): BackendType | null => {
  return runtimeBackendOverride;
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
 * Resolves the active backend type.
 * Default is ALWAYS 'supabase' to ensure zero disruption to live production.
 */
export const getBackendType = (): BackendType => {
  if (runtimeBackendOverride) {
    return runtimeBackendOverride;
  }

  const envType = readEnv('EXPO_PUBLIC_BACKEND_TYPE')?.toLowerCase()?.trim();
  const envFlag = readEnv('EXPO_PUBLIC_USE_SELF_HOSTED_BACKEND')?.toLowerCase()?.trim();

  if (envType === 'self_hosted' || envFlag === 'true' || envFlag === '1') {
    return 'self_hosted';
  }

  return 'supabase';
};

export const isSelfHosted = (): boolean => {
  return getBackendType() === 'self_hosted';
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
