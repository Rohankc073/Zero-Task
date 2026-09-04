import { httpClient } from './httpClient';
import { getStorageUrl, getApiUrl } from '../config';
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
      const fileName = path.split('/').pop() || 'upload.bin';
      let byteLength = 0;

      if (fileBody instanceof ArrayBuffer) {
        byteLength = fileBody.byteLength;
      } else if (fileBody?.size) {
        byteLength = fileBody.size;
      } else if (typeof fileBody === 'string') {
        byteLength = fileBody.length;
      }

      const mimeType = options?.contentType || 'application/octet-stream';

      // 1. Request presigned PUT URL from FastAPI
      const { data: presignedData, error: presignedError } = await httpClient.post(
        '/storage/upload-request',
        {
          bucket: this.bucket,
          file_name: fileName,
          file_size_bytes: byteLength,
          mime_type: mimeType,
        }
      );

      if (presignedError || !presignedData?.upload_url) {
        return {
          data: null,
          error: presignedError || { message: 'Failed to obtain upload URL' },
        };
      }

      // 2. Stream binary payload directly to MinIO
      const putRes = await fetch(presignedData.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType,
        },
        body: fileBody,
      });

      if (!putRes.ok) {
        return {
          data: null,
          error: {
            message: `Direct S3 upload failed with status ${putRes.status}`,
            status: putRes.status,
          },
        };
      }

      return {
        data: { path: presignedData.storage_path },
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
    const storageBase = getStorageUrl();
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return {
      data: {
        publicUrl: `${storageBase}/${this.bucket}/${cleanPath}`,
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
      )}&storage_path=${encodeURIComponent(path)}`;

      const { data, error } = await httpClient.post(endpoint);
      if (error || !data?.url) {
        return {
          data: null,
          error: error || { message: 'Failed to generate signed URL' },
        };
      }

      return {
        data: { signedUrl: data.url },
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
    // Presigned S3 deletion stub
    return { data: paths, error: null };
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
