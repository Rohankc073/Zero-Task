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
const LOCAL_LAN_HOST = '192.168.29.169:8088';

export const getApiUrl = (): string => {
  return `https://${DEFAULT_TUNNEL_HOST}/api/v1`;
};

export const getWsUrl = (): string => {
  return `wss://${DEFAULT_TUNNEL_HOST}/ws`;
};

export const getStorageUrl = (): string => {
  return `https://${DEFAULT_TUNNEL_HOST}/storage`;
};


