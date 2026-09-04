import 'react-native-url-polyfill/auto';
import { isSelfHosted, getBackendType } from '../adapter/config';
import { getRealSupabaseClient } from './supabaseClient';
import { createFastApiClient, FastApiClient } from '../adapter/fastapi/fastApiClient';
import type { SupabaseClient } from '@supabase/supabase-js';

const selfHostedActive = isSelfHosted();

if (__DEV__) {
  console.log(
    `[ZeroTask Backend Adapter] Initialized in '${getBackendType()}' mode. ` +
      (selfHostedActive
        ? 'Traffic routed to self-hosted FastAPI + PostgreSQL + MinIO stack.'
        : 'Traffic routed to default managed Supabase BaaS.')
  );
}

/**
 * Universal backend client singleton.
 * - When EXPO_PUBLIC_BACKEND_TYPE === 'supabase' (DEFAULT): Exports the authentic Supabase client.
 * - When EXPO_PUBLIC_BACKEND_TYPE === 'self_hosted': Exports the FastAPI Adapter client.
 */
export const supabase: SupabaseClient | FastApiClient | any = selfHostedActive
  ? createFastApiClient()
  : getRealSupabaseClient();
