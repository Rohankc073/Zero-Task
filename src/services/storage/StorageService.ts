import { apiClient, ApiResponse } from '../api/apiClient';

export interface UploadRequestResponse {
  upload_url: string;
  storage_path: string;
  file_key?: string;
  public_url?: string;
  bucket: string;
  expires_in_seconds?: number;
}

export interface SignedUrlResponse {
  url: string;
  download_url?: string;
  file_key?: string;
  expires_in?: number;
  expires_in_seconds?: number;
}

export const StorageService = {
  /**
   * Request a presigned PUT URL from FastAPI to upload directly to MinIO
   */
  async requestUploadUrl(
    bucket: string,
    fileName: string,
    contentType: string,
    fileSize?: number
  ): Promise<ApiResponse<UploadRequestResponse>> {
    return apiClient.post<UploadRequestResponse>('/storage/upload-request', {
      bucket,
      file_name: fileName,
      mime_type: contentType,
      content_type: contentType,
      file_size_bytes: fileSize || 1024,
      file_size: fileSize || 1024,
    });
  },

  /**
   * Upload binary data directly to MinIO via the presigned PUT URL
   */
  async uploadBinary(
    uploadUrl: string,
    fileBody: Blob | ArrayBuffer | string,
    contentType: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        body: fileBody,
      });

      if (!res.ok) {
        return { success: false, error: `Upload failed: HTTP ${res.status}` };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Binary upload error' };
    }
  },

  /**
   * Confirm successful upload with FastAPI
   */
  async confirmUpload(
    fileKey: string,
    bucket: string,
    metadata?: Record<string, any>
  ): Promise<ApiResponse<any>> {
    return apiClient.post('/storage/confirm', {
      file_key: fileKey,
      bucket,
      metadata,
    });
  },

  /**
   * Generate an authorized presigned GET URL for downloading private assets
   */
  async getDownloadUrl(
    bucket: string,
    fileKey: string,
    expiresIn = 3600
  ): Promise<ApiResponse<SignedUrlResponse>> {
    const qp = [
      `bucket=${encodeURIComponent(bucket)}`,
      `file_key=${encodeURIComponent(fileKey)}`,
      `expires_in=${expiresIn}`,
    ];
    return apiClient.get<SignedUrlResponse>(`/storage/signed-url?${qp.join('&')}`);
  },
};
