/**
 * ZeroTask — Dual-Run Architecture Verification Script
 * Validates adapter contract compliance, environment switching, and query builder mechanics.
 */

import { getBackendType, isSelfHosted, getApiUrl, getWsUrl } from '../src/adapter/config';
import { createFastApiClient } from '../src/adapter/fastapi/fastApiClient';
import { FastApiQueryBuilder } from '../src/adapter/fastapi/queryBuilder';
import { storageAdapter } from '../src/adapter/fastapi/storageAdapter';
import { realtimeManager } from '../src/adapter/fastapi/realtimeAdapter';
import { authAdapter } from '../src/adapter/fastapi/authAdapter';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runVerification() {
  console.log('=====================================================');
  console.log('ZeroTask Dual-Run Backend Adapter Verification Suite');
  console.log('=====================================================\n');

  // Test 1: Default configuration behavior
  console.log('--- Test 1: Default Backend Configuration ---');
  delete process.env.EXPO_PUBLIC_BACKEND_TYPE;
  delete process.env.EXPO_PUBLIC_USE_SELF_HOSTED_BACKEND;
  assert(getBackendType() === 'supabase', "Default backend type must be 'supabase'");
  assert(isSelfHosted() === false, 'Default isSelfHosted() must return false');

  // Test 2: Toggle to self-hosted mode
  console.log('\n--- Test 2: Toggle to Self-Hosted Mode ---');
  process.env.EXPO_PUBLIC_BACKEND_TYPE = 'self_hosted';
  assert(getBackendType() === 'self_hosted', "getBackendType() must return 'self_hosted'");
  assert(isSelfHosted() === true, 'isSelfHosted() must return true');
  assert(getApiUrl().includes('/api/v1'), 'API URL must point to /api/v1');
  assert(getWsUrl().includes('/ws'), 'WS URL must point to /ws');

  // Test 3: FastApiClient Interface Compliance
  console.log('\n--- Test 3: FastApiClient Interface Parity ---');
  const client = createFastApiClient();
  assert(typeof client.from === 'function', 'client.from() must be a function');
  assert(typeof client.channel === 'function', 'client.channel() must be a function');
  assert(typeof client.removeChannel === 'function', 'client.removeChannel() must be a function');
  assert(typeof client.rpc === 'function', 'client.rpc() must be a function');
  assert(typeof client.storage?.from === 'function', 'client.storage.from() must be a function');
  assert(typeof client.auth?.signInWithPassword === 'function', 'client.auth.signInWithPassword() must exist');
  assert(typeof client.auth?.signOut === 'function', 'client.auth.signOut() must exist');
  assert(typeof client.auth?.getSession === 'function', 'client.auth.getSession() must exist');
  assert(typeof client.auth?.onAuthStateChange === 'function', 'client.auth.onAuthStateChange() must exist');
  assert(typeof client.functions?.invoke === 'function', 'client.functions.invoke() must exist');

  // Test 4: Query Builder Fluent API
  console.log('\n--- Test 4: FastApiQueryBuilder Fluent Chaining ---');
  const qb = new FastApiQueryBuilder('tasks')
    .select('id, title, status')
    .eq('status', 'Todo')
    .neq('is_deleted', true)
    .in('priority', ['High', 'Critical'])
    .order('created_at', { ascending: false })
    .limit(10);

  assert(qb instanceof FastApiQueryBuilder, 'Query builder must support chaining methods');
  assert(typeof qb.then === 'function', 'Query builder must be PromiseLike (awaitable)');

  // Test 5: Storage Adapter Public & Signed URLs
  console.log('\n--- Test 5: Storage Adapter Contract ---');
  const bucketClient = storageAdapter.from('avatars');
  const pubUrl = bucketClient.getPublicUrl('test_user.png');
  assert(
    pubUrl.data.publicUrl.includes('/avatars/test_user.png'),
    'Public URL must format correct MinIO object path'
  );

  // Test 6: Realtime Subscriptions
  console.log('\n--- Test 6: Realtime Channel Interface ---');
  const channel = realtimeManager.channel('chat_test_123');
  let eventDispatched = false;

  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'chat_messages' },
    (payload) => {
      if (payload.new?.content === 'Hello ZeroTask') {
        eventDispatched = true;
      }
    }
  );

  channel.subscribe();
  // Simulate an incoming WebSocket dispatch
  (channel as any).dispatch('chat_messages', 'INSERT', { content: 'Hello ZeroTask' });
  assert(eventDispatched, 'Realtime channel must dispatch payload to registered listener');

  channel.unsubscribe();

  // Test 7: Reset to Default Safe Baseline
  console.log('\n--- Test 7: Reversibility (Safe Reset) ---');
  delete process.env.EXPO_PUBLIC_BACKEND_TYPE;
  assert(getBackendType() === 'supabase', 'Must reset back to Supabase cleanly');
  assert(!isSelfHosted(), 'Must confirm isSelfHosted() is false after reset');

  console.log('\n=====================================================');
  console.log('🎉 ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  console.log('=====================================================\n');
}

runVerification().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
