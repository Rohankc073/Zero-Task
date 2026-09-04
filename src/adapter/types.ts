import { Session, User as SupabaseUser } from '@supabase/supabase-js';

export interface AdapterUser {
  id: string;
  email: string;
  name?: string | null;
  full_name?: string | null;
  role: string;
  company_id?: string | null;
  department_id?: string | null;
  designation_id?: string | null;
  is_approved: boolean;
  is_active: boolean;
  avatar_url?: string | null;
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
}

export interface AdapterSession {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  user: AdapterUser;
}

export interface AdapterResponse<T> {
  data: T | null;
  error: { message: string; code?: string; status?: number } | null;
  count?: number | null;
}

export type AuthChangeEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED';

export type AuthStateChangeCallback = (
  event: AuthChangeEvent,
  session: Session | AdapterSession | null
) => void;

export interface RealtimePostgresChangesPayload<T = any> {
  schema: string;
  table: string;
  commit_timestamp?: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  new: T;
  old: Partial<T>;
  errors?: string[] | null;
}

export interface IRealtimeChannel {
  on(
    type: 'postgres_changes',
    filter: { event: string; schema: string; table: string; filter?: string },
    callback: (payload: RealtimePostgresChangesPayload) => void
  ): IRealtimeChannel;
  subscribe(callback?: (status: string, err?: any) => void): IRealtimeChannel;
  unsubscribe(): void;
}

export interface IStorageBucketClient {
  upload(
    path: string,
    fileBody: ArrayBuffer | Blob | string | any,
    options?: { contentType?: string; upsert?: boolean }
  ): Promise<AdapterResponse<{ path: string }>>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
  createSignedUrl(
    path: string,
    expiresIn: number
  ): Promise<AdapterResponse<{ signedUrl: string }>>;
  remove(paths: string[]): Promise<AdapterResponse<any>>;
}

export interface IStorageClient {
  from(bucket: string): IStorageBucketClient;
}
