import 'react-native-url-polyfill/auto';
import { createFastApiClient, FastApiClient } from '../adapter/fastapi/fastApiClient';

if (__DEV__) {
  console.log('[ZeroTask Backend] Initialized in self-hosted mode: FastAPI + PostgreSQL + MinIO stack.');
}

/**
 * Universal backend client singleton for self-hosted FastAPI stack.
 */
export const supabase: FastApiClient = createFastApiClient();
export default supabase;
