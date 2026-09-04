export * from './config';
export * from './types';
export { httpClient } from './fastapi/httpClient';
export { authAdapter } from './fastapi/authAdapter';
export { storageAdapter } from './fastapi/storageAdapter';
export { realtimeManager } from './fastapi/realtimeAdapter';
export { createFastApiClient, FastApiClient } from './fastapi/fastApiClient';
