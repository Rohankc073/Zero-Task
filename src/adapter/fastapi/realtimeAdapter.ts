import { httpClient } from './httpClient';
import { getWsUrl } from '../config';
import {
  IRealtimeChannel,
  RealtimePostgresChangesPayload,
} from '../types';

type Listener = {
  event: string;
  table: string;
  filter?: string;
  callback: (payload: RealtimePostgresChangesPayload) => void;
};

class RealtimeChannel implements IRealtimeChannel {
  private listeners: Listener[] = [];
  private isSubscribed = false;

  constructor(public readonly name: string, private manager: RealtimeManager) {}

  on(
    type: 'postgres_changes',
    filter: { event: string; schema: string; table: string; filter?: string },
    callback: (payload: RealtimePostgresChangesPayload) => void
  ): IRealtimeChannel {
    this.listeners.push({
      event: filter.event.toUpperCase(),
      table: filter.table.toLowerCase(),
      filter: filter.filter,
      callback,
    });
    return this;
  }

  subscribe(callback?: (status: string, err?: any) => void): IRealtimeChannel {
    this.isSubscribed = true;
    this.manager.registerChannel(this);
    if (callback) {
      setTimeout(() => callback('SUBSCRIBED'), 50);
    }
    return this;
  }

  unsubscribe(): void {
    this.isSubscribed = false;
    this.manager.unregisterChannel(this);
  }

  dispatch(tableName: string, action: string, record: any) {
    if (!this.isSubscribed) return;

    const normalizedTable = tableName.toLowerCase();
    const normalizedAction = action.toUpperCase();

    for (const listener of this.listeners) {
      // 1. Table match
      if (listener.table !== '*' && listener.table !== normalizedTable) {
        continue;
      }

      // 2. Action match
      if (listener.event !== '*' && listener.event !== normalizedAction) {
        continue;
      }

      // 3. Filter match (e.g. "channel_id=eq.1234")
      if (listener.filter) {
        const [filterCol, rest] = listener.filter.split('=');
        if (filterCol && rest && rest.startsWith('eq.')) {
          const filterVal = rest.substring(3);
          if (String(record[filterCol]) !== String(filterVal)) {
            continue;
          }
        }
      }

      // Dispatch payload to listener
      try {
        listener.callback({
          schema: 'public',
          table: normalizedTable,
          eventType: normalizedAction as any,
          new: record,
          old: {},
          commit_timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`[RealtimeChannel:${this.name}] Listener error:`, err);
      }
    }
  }
}

class RealtimeManager {
  private ws: WebSocket | null = null;
  private channels: Map<string, RealtimeChannel> = new Map();
  private pingInterval: any = null;
  private reconnectTimeout: any = null;
  private isConnecting = false;

  constructor() {
    // Lazy connect on first subscription
  }

  registerChannel(channel: RealtimeChannel) {
    this.channels.set(channel.name, channel);
    this.ensureConnection();

    // If channel is a chat channel (e.g. chat_<channel_id>), notify server to join
    if (channel.name.startsWith('chat_')) {
      const channelId = channel.name.replace('chat_', '');
      this.sendJson({ action: 'join_channel', channel_id: channelId });
    }
  }

  unregisterChannel(channel: RealtimeChannel) {
    this.channels.delete(channel.name);
    if (channel.name.startsWith('chat_')) {
      const channelId = channel.name.replace('chat_', '');
      this.sendJson({ action: 'leave_channel', channel_id: channelId });
    }
  }

  private sendJson(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
      } catch (e) {
        // ignore send errors
      }
    }
  }

  private ensureConnection() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = httpClient.getAccessToken();
    if (!token) {
      // Delay connection until user is authenticated
      return;
    }

    if (this.isConnecting) return;
    this.isConnecting = true;

    const wsUrl = `${getWsUrl()}?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        // Start ping heartbeat
        this.startHeartbeat();

        // Rejoin any active chat channels
        for (const [name] of this.channels) {
          if (name.startsWith('chat_')) {
            const channelId = name.replace('chat_', '');
            this.sendJson({ action: 'join_channel', channel_id: channelId });
          }
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (err) => {
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      };
    } catch (e) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      if (this.channels.size > 0) {
        this.ensureConnection();
      }
    }, 5000);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      this.sendJson({ action: 'ping' });
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleMessage(dataText: string) {
    try {
      const msg = JSON.parse(dataText);
      if (msg.action === 'pong') return;

      const eventType = msg.event;
      const payload = msg.payload || msg.data || {};
      const action = payload.action || 'INSERT';
      const record = payload.record || payload;

      let tableName = 'tasks';
      if (eventType === 'TASK_UPDATE') tableName = 'tasks';
      else if (eventType === 'MEETING_UPDATE') tableName = 'meetings';
      else if (eventType === 'NEW_MESSAGE') tableName = 'chat_messages';
      else if (eventType === 'NEW_NOTIFICATION') tableName = 'in_app_notifications';
      else if (eventType === 'APPROVAL_UPDATE') tableName = 'meeting_approvals';
      else if (eventType === 'AUDIT_LOG_INSERT') tableName = 'audit_logs';
      else if (eventType === 'SYSTEM_ALERT') tableName = 'system_alerts';

      // Broadcast to all registered channels
      for (const [, channel] of this.channels) {
        channel.dispatch(tableName, action, record);
      }
    } catch (e) {
      // ignore message parse errors
    }
  }

  channel(name: string): IRealtimeChannel {
    let ch = this.channels.get(name);
    if (!ch) {
      ch = new RealtimeChannel(name, this);
    }
    return ch;
  }

  removeChannel(channel: IRealtimeChannel) {
    channel.unsubscribe();
  }
}

export const realtimeManager = new RealtimeManager();
