import { httpClient } from './httpClient';
import { getApiUrl } from '../config';
import {
  IStorageClient,
  IStorageBucketClient,
  AdapterResponse,
} from '../types';

class StorageBucketClient implements IStorageBucketClient {
  constructor(private bucket: string) {}

  async upload(
    path: string,
    fileBody: ArrayBuffer | Blob | string | any,
    options?: { contentType?: string; upsert?: boolean }
  ): Promise<AdapterResponse<{ path: string }>> {
    try {
      const cleanPath = path.startsWith('/') ? path.substring(1) : path;
      const mimeType = options?.contentType || 'application/octet-stream';
      const apiUrl = getApiUrl();
      const token = httpClient.getAccessToken();

      // Direct streaming upload to FastAPI backend endpoint
      const uploadUrl = `${apiUrl}/storage/upload?bucket=${encodeURIComponent(
        this.bucket
      )}&storage_path=${encodeURIComponent(cleanPath)}`;

      const headers: Record<string, string> = {
        'Content-Type': mimeType,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers,
        body: fileBody,
      });

      if (!res.ok) {
        let errMsg = `Upload failed with status ${res.status}`;
        try {
          const errJson = await res.json();
          errMsg = errJson.detail || errJson.message || errMsg;
        } catch {}
        return {
          data: null,
          error: { message: errMsg, status: res.status },
        };
      }

      const resData = await res.json();
      return {
        data: { path: resData?.storage_path || cleanPath },
        error: null,
      };
    } catch (err: any) {
      return {
        data: null,
        error: { message: err?.message || 'Storage upload failed' },
      };
    }
  }

  getPublicUrl(path: string): { data: { publicUrl: string } } {
    const apiUrl = getApiUrl();
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    const token = httpClient.getAccessToken();
    const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';
    return {
      data: {
        publicUrl: `${apiUrl}/storage/download?bucket=${encodeURIComponent(
          this.bucket
        )}&storage_path=${encodeURIComponent(cleanPath)}${tokenQuery}`,
      },
    };
  }

  async createSignedUrl(
    path: string,
    expiresIn: number = 900
  ): Promise<AdapterResponse<{ signedUrl: string }>> {
    try {
      const endpoint = `/storage/signed-url?bucket=${encodeURIComponent(
        this.bucket
      )}&storage_path=${encodeURIComponent(path)}&expires_in=${expiresIn}`;

      const { data, error } = await httpClient.post(endpoint);
      if (error || !data?.url) {
        return {
          data: null,
          error: error || { message: 'Failed to generate signed URL' },
        };
      }

      let signedUrl = data.url;
      if (signedUrl.startsWith('/')) {
        signedUrl = `${getApiUrl()}${signedUrl}`;
      }

      return {
        data: { signedUrl },
        error: null,
      };
    } catch (err: any) {
      return {
        data: null,
        error: { message: err?.message || 'Signed URL generation failed' },
      };
    }
  }

  async remove(paths: string[]): Promise<AdapterResponse<any>> {
    try {
      const { data, error } = await httpClient.post('/storage/delete', {
        bucket: this.bucket,
        paths,
      });
      if (error) {
        return { data: null, error };
      }
      return { data: paths, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || 'Deletion failed' } };
    }
  }
}

export class StorageAdapter implements IStorageClient {
  private bucketClients: Map<string, StorageBucketClient> = new Map();

  from(bucket: string): IStorageBucketClient {
    let client = this.bucketClients.get(bucket);
    if (!client) {
      client = new StorageBucketClient(bucket);
      this.bucketClients.set(bucket, client);
    }
    return client;
  }
}

export const storageAdapter = new StorageAdapter();
