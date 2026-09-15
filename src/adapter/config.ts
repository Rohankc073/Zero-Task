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

const DEFAULT_TUNNEL_HOST = 'weak-grasshopper-22.loca.lt';

export const getApiUrl = (): string => {
  const custom = process.env.EXPO_PUBLIC_API_URL || readEnv('EXPO_PUBLIC_API_URL');
  if (custom && !custom.includes('10.142.16.179') && !custom.includes('192.168.29.169') && !custom.includes('moody-chicken-40')) {
    return custom.replace(/\/+$/, '');
  }
  return `https://${DEFAULT_TUNNEL_HOST}/api/v1`;
};

export const getWsUrl = (): string => {
  const custom = process.env.EXPO_PUBLIC_WS_URL || readEnv('EXPO_PUBLIC_WS_URL');
  if (custom && !custom.includes('10.142.16.179') && !custom.includes('192.168.29.169') && !custom.includes('moody-chicken-40')) {
    return custom.replace(/\/+$/, '');
  }
  return `wss://${DEFAULT_TUNNEL_HOST}/ws`;
};

export const getStorageUrl = (): string => {
  const custom = process.env.EXPO_PUBLIC_STORAGE_URL || readEnv('EXPO_PUBLIC_STORAGE_URL');
  if (custom && !custom.includes('10.142.16.179') && !custom.includes('192.168.29.169') && !custom.includes('moody-chicken-40')) {
    return custom.replace(/\/+$/, '');
  }
  return `https://${DEFAULT_TUNNEL_HOST}/storage`;
};


