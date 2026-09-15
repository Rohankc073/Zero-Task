import { apiClient } from '../api/apiClient';

export type TaskEventType =
  | 'TASK_MUTATED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_COMPLETED'
  | 'TASK_DELETED';

export type TaskEventHandler = (event: TaskEventType, payload?: any) => void;

class TaskEventBusClass {
  private handlers: Set<TaskEventHandler> = new Set();
  private wsUnsubscribe: (() => void) | null = null;

  constructor() {
    this.initWebSocketBridge();
  }

  private initWebSocketBridge() {
    try {
      this.wsUnsubscribe = apiClient.subscribeWebSocket((event, payload) => {
        if (
          event === 'TASK_UPDATE' ||
          event === 'TASK_MUTATED' ||
          (event === 'NEW_NOTIFICATION' &&
            payload?.record &&
            (payload.record.type === 'task_assignment' ||
              payload.record.type === 'task_completed' ||
              payload.record.action_url?.includes('task')))
        ) {
          console.log(`[HOME_TASK_EVENT] event_type=${event} task_id=${payload?.task_id || payload?.record?.id || 'unknown'}`);
          this.emit('TASK_MUTATED', payload);
        }
      });
    } catch (err) {
      console.warn('[TaskEventBus] Error initializing WebSocket bridge:', err);
    }
  }

  subscribe(handler: TaskEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(event: TaskEventType, payload?: any): void {
    this.handlers.forEach((handler) => {
      try {
        handler(event, payload);
      } catch (err) {
        console.error('[TaskEventBus] Error in subscriber handler:', err);
      }
    });
  }

  emitTaskMutated(action: string, taskOrId?: any): void {
    const taskId = typeof taskOrId === 'string' ? taskOrId : taskOrId?.id;
    console.log(`[HOME_TASK_EVENT] event_type=TASK_MUTATED_${action} task_id=${taskId || 'unknown'}`);
    this.emit('TASK_MUTATED', { action, task: taskOrId, taskId });
  }
}

export const TaskEventBus = new TaskEventBusClass();
