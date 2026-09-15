import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { apiClient } from '../services/api/apiClient';

const QUEUE_KEY = 'OFFLINE_MUTATION_QUEUE';

interface Mutation {
  id: string;
  table: string;
  action: 'UPDATE' | 'INSERT' | 'DELETE';
  payload: any;
  matchKey: string;
  matchValue: any;
  timestamp: number;
}

export class OfflineManager {
  static async enqueueMutation(mutation: Omit<Mutation, 'id' | 'timestamp'>) {
    const newMutation: Mutation = {
      ...mutation,
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
    };

    try {
      const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
      const queue: Mutation[] = queueStr ? JSON.parse(queueStr) : [];
      queue.push(newMutation);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      console.log('[OfflineManager] Mutation queued offline:', newMutation.action, newMutation.table);
    } catch (error) {
      console.error('[OfflineManager] Failed to enqueue mutation:', error);
    }
  }

  static async processQueue() {
    try {
      const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
      if (!queueStr) return;

      const queue: Mutation[] = JSON.parse(queueStr);
      if (queue.length === 0) return;

      console.log(`[OfflineManager] Processing ${queue.length} offline mutations via FastAPI /sync/mutations...`);

      const batchPayload = {
        mutations: queue.map((m) => ({
          id: m.id,
          table: m.table,
          action: m.action,
          payload: m.payload,
          match_key: m.matchKey,
          match_value: m.matchValue,
          timestamp: new Date(m.timestamp).toISOString(),
        })),
      };

      const { data, error } = await apiClient.post('/sync/mutations', batchPayload);
      if (!error && data?.results) {
        const failedIds = new Set(
          data.results
            .filter((r: any) => r.status === 'error')
            .map((r: any) => r.id)
        );
        const remaining = queue.filter((m) => failedIds.has(m.id));
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
        console.log(
          `[OfflineManager] Sync completed: ${data.applied} applied, ${data.failed} failed`
        );
      }
    } catch (error) {
      console.error('[OfflineManager] Error processing offline queue:', error);
    }
  }

  private static isInitialized = false;

  static init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    try {
      NetInfo.addEventListener((state) => {
        if (state.isConnected && state.isInternetReachable) {
          this.processQueue();
        }
      });
    } catch (e) {
      console.warn('[OfflineManager] NetInfo listener setup warning:', e);
    }
  }
}
