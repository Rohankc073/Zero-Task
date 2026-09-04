import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { isSelfHosted, httpClient } from '../adapter';

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
      console.log('Mutation queued offline:', newMutation.action);
    } catch (error) {
      console.error('Failed to enqueue mutation:', error);
    }
  }

  static async processQueue() {
    try {
      const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
      if (!queueStr) return;
      
      const queue: Mutation[] = JSON.parse(queueStr);
      if (queue.length === 0) return;

      console.log(`Processing ${queue.length} offline mutations...`);

      // 1. If self-hosted backend is active, use the server-side batch sync endpoint
      if (isSelfHosted()) {
        try {
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

          const { data, error } = await httpClient.post('/sync/mutations', batchPayload);
          if (!error && data?.results) {
            const failedIds = new Set(
              data.results
                .filter((r: any) => r.status === 'error')
                .map((r: any) => r.id)
            );
            const remaining = queue.filter((m) => failedIds.has(m.id));
            await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
            console.log(
              `[OfflineManager] Self-hosted sync completed: ${data.applied} applied, ${data.failed} failed`
            );
            return;
          }
        } catch (syncErr) {
          console.warn('[OfflineManager] Batch sync failed, falling back to individual replay:', syncErr);
        }
      }

      // 2. Default replay mechanism (Supabase or fallback)
      const failedMutations: Mutation[] = [];

      for (const mutation of queue) {
        try {
          if (mutation.action === 'UPDATE') {
            const { error } = await supabase
              .from(mutation.table)
              .update(mutation.payload)
              .eq(mutation.matchKey, mutation.matchValue);
            if (error) throw error;
          } else if (mutation.action === 'INSERT') {
            const { error } = await supabase
              .from(mutation.table)
              .insert(mutation.payload);
            if (error) throw error;
          } else if (mutation.action === 'DELETE') {
            const { error } = await supabase
              .from(mutation.table)
              .delete()
              .eq(mutation.matchKey, mutation.matchValue);
            if (error) throw error;
          }
        } catch (err) {
          console.error('Failed to process mutation:', err);
          failedMutations.push(mutation);
        }
      }

      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failedMutations));
    } catch (error) {
      console.error('Error processing offline queue:', error);
    }
  }

  static init() {
    NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        this.processQueue();
      }
    });
  }
}
