import { getBackendType, isSelfHosted, getApiUrl, getWsUrl } from '../../src/adapter/config';
import { createFastApiClient } from '../../src/adapter/fastapi/fastApiClient';
import { FastApiQueryBuilder } from '../../src/adapter/fastapi/queryBuilder';
import { storageAdapter } from '../../src/adapter/fastapi/storageAdapter';
import { realtimeManager } from '../../src/adapter/fastapi/realtimeAdapter';

describe('ZeroTask Dual-Run Backend Adapter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_BACKEND_TYPE;
    delete process.env.EXPO_PUBLIC_USE_SELF_HOSTED_BACKEND;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Configuration & Default Fallback', () => {
    it('defaults to supabase when no toggle is present', () => {
      delete process.env.EXPO_PUBLIC_BACKEND_TYPE;
      delete process.env.EXPO_PUBLIC_USE_SELF_HOSTED_BACKEND;
      expect(getBackendType()).toBe('supabase');
      expect(isSelfHosted()).toBe(false);
    });

    it('toggles to self_hosted when EXPO_PUBLIC_BACKEND_TYPE is self_hosted', () => {
      process.env.EXPO_PUBLIC_BACKEND_TYPE = 'self_hosted';
      expect(getBackendType()).toBe('self_hosted');
      expect(isSelfHosted()).toBe(true);
      expect(getApiUrl()).toContain('/api/v1');
      expect(getWsUrl()).toContain('/ws');
    });

    it('toggles to self_hosted when EXPO_PUBLIC_USE_SELF_HOSTED_BACKEND is true', () => {
      delete process.env.EXPO_PUBLIC_BACKEND_TYPE;
      process.env.EXPO_PUBLIC_USE_SELF_HOSTED_BACKEND = 'true';
      expect(getBackendType()).toBe('self_hosted');
      expect(isSelfHosted()).toBe(true);
    });

    it('reverts cleanly back to supabase', () => {
      process.env.EXPO_PUBLIC_BACKEND_TYPE = 'self_hosted';
      expect(isSelfHosted()).toBe(true);

      delete process.env.EXPO_PUBLIC_BACKEND_TYPE;
      expect(getBackendType()).toBe('supabase');
      expect(isSelfHosted()).toBe(false);
    });
  });

  describe('FastApiClient Parity', () => {
    it('exposes identical Supabase client API methods', () => {
      const client = createFastApiClient();
      expect(typeof client.from).toBe('function');
      expect(typeof client.channel).toBe('function');
      expect(typeof client.removeChannel).toBe('function');
      expect(typeof client.rpc).toBe('function');
      expect(typeof client.storage?.from).toBe('function');
      expect(typeof client.auth?.signInWithPassword).toBe('function');
      expect(typeof client.auth?.signOut).toBe('function');
      expect(typeof client.auth?.getSession).toBe('function');
      expect(typeof client.auth?.onAuthStateChange).toBe('function');
      expect(typeof client.functions?.invoke).toBe('function');
    });

    it('supports fluent query builder chaining', () => {
      const qb = new FastApiQueryBuilder('tasks')
        .select('id, title, status')
        .eq('status', 'Todo')
        .neq('is_deleted', true)
        .in('priority', ['High', 'Critical'])
        .order('created_at', { ascending: false })
        .limit(10);

      expect(qb).toBeInstanceOf(FastApiQueryBuilder);
      expect(typeof qb.then).toBe('function');
    });

    it('formats storage public URLs matching MinIO bucket paths', () => {
      const bucketClient = storageAdapter.from('avatars');
      const pubUrl = bucketClient.getPublicUrl('user_123.png');
      expect(pubUrl.data.publicUrl).toContain('/avatars/user_123.png');
    });

    it('registers and dispatches realtime postgres_changes callbacks', () => {
      const channel = realtimeManager.channel('chat_test_channel');
      let dispatched = false;

      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          if (payload.new?.content === 'Dual-run active') {
            dispatched = true;
          }
        }
      );

      channel.subscribe();
      (channel as any).dispatch('chat_messages', 'INSERT', { content: 'Dual-run active' });
      expect(dispatched).toBe(true);

      channel.unsubscribe();
    });
  });
});
