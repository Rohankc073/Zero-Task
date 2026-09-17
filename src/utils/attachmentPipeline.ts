import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { apiClient } from '../services/api/apiClient';
import { getApiUrl } from '../adapter/config';

export const MAX_TASK_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

export const SUPPORTED_FILE_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'ppt',
  'pptx',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'zip',
];

export const SUPPORTED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/*',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
];

/**
 * Formats byte count to a clean human-readable string (e.g. 450 KB, 2.4 MB).
 */
export const formatFileSize = (bytes?: number | null): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/**
 * Validates a file's extension, mime type, and cumulative size against limits.
 */
export const validateAttachment = (
  file: { name: string; size?: number; mimeType?: string },
  currentTotalBytes: number = 0
): { valid: boolean; error?: string; extension: string } => {
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  
  if (!SUPPORTED_FILE_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Unsupported file format (.${extension}). Allowed formats: PDF, DOC, DOCX, XLS, XLSX, CSV, PPT, PPTX, JPG, PNG, WEBP, GIF, ZIP.`,
      extension
    };
  }

  const fileSize = file.size || 0;
  if (currentTotalBytes + fileSize > MAX_TASK_ATTACHMENT_BYTES) {
    return {
      valid: false,
      error: 'Attachments cannot exceed 20 MB per task.',
      extension
    };
  }

  return { valid: true, extension };
};

/**
 * Loads binary data from any URI (content://, file://, http://) using React Native's native fetch.
 * Native fetch in React Native natively delegates to Android's ContentResolver and OkHttp,
 * completely bypassing ExponentFileSystem file path restrictions.
 */
export const readFileAsArrayBuffer = async (uri: string): Promise<ArrayBuffer> => {
  // Strategy 1: FileSystem base64 (Direct native file read if within sandbox)
  try {
    const isDocPicker = uri.includes('/DocumentPicker/');
    const isContentUri = uri.startsWith('content://');
    const cacheDir = FileSystem?.cacheDirectory;
    const docDir = FileSystem?.documentDirectory;
    const isOutsideSandbox = (cacheDir && !uri.startsWith(cacheDir)) && (docDir && !uri.startsWith(docDir));
    const canUseFs = !isContentUri && !(isDocPicker && isOutsideSandbox);

    if (canUseFs) {
      const base64Str = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (base64Str) {
        return decode(base64Str);
      }
    }
  } catch (fsErr) {
    // Strategy 1 failed, fall through to Strategy 2
  }

  // Strategy 2: Native Fetch ArrayBuffer
  try {
    const response = await fetch(uri);
    if (response.ok || response.status === 0) {
      const buffer = await response.arrayBuffer();
      if (buffer && buffer.byteLength > 0) {
        return buffer;
      }
    }
  } catch (fetchErr: any) {
    console.error('All file read strategies failed:', fetchErr);
    throw new Error(`Could not read file data: ${fetchErr.message}`);
  }

  throw new Error('Unable to read attachment data.');
};

/**
 * Uploads a validated local file to MinIO via FastAPI /storage/upload (self-hosted, no Supabase).
 * Uses native FileSystem streaming on mobile to set explicit Content-Length (preventing 502 Bad Gateway
 * caused by chunked encoding over reverse proxies/tunnels), with automatic retry on transient errors.
 * Returns the storage path (used as identifier to build presigned/served URLs later).
 */
export const uploadAttachmentBinary = async (
  uri: string,
  bucket: string,
  path: string,
  mimeType: string,
  fileName?: string
): Promise<string> => {
  const maxAttempts = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Primary: Native FileSystem streaming with Content-Length (OkHttp/NSURLSession)
      const res = await apiClient.uploadFileUri(
        bucket,
        path,
        uri,
        mimeType || 'application/octet-stream',
        fileName
      );

      if (!res.error) {
        // Return the canonical FastAPI served URL for this file
        const apiUrl = getApiUrl();
        return `${apiUrl}/storage/serve?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`;
      }

      lastError = new Error(res.error.message || 'Upload failed');
      const errorMsg = String(res.error.message || '').toLowerCase();
      const isTransient =
        res.error.status === 502 ||
        res.error.status === 503 ||
        res.error.status === 504 ||
        res.error.code === 'NETWORK_ERROR' ||
        errorMsg.includes('502') ||
        errorMsg.includes('bad gateway') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('network');

      if (isTransient && attempt < maxAttempts) {
        console.warn(`[AttachmentPipeline] Upload attempt ${attempt} failed with ${res.error.message}, retrying in ${attempt}s...`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      throw lastError;
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || '').toLowerCase();
      const isTransient =
        errMsg.includes('502') ||
        errMsg.includes('503') ||
        errMsg.includes('504') ||
        errMsg.includes('bad gateway') ||
        errMsg.includes('timeout') ||
        errMsg.includes('network') ||
        errMsg.includes('connection aborted');

      if (isTransient && attempt < maxAttempts) {
        console.warn(`[AttachmentPipeline] Upload attempt ${attempt} error: ${err.message}, retrying in ${attempt}s...`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      break;
    }
  }

  throw new Error('Upload failed: ' + (lastError?.message || 'Unknown error'));
};

/**
 * Complete pipeline combining validation and native binary upload.
 */
export const processAndUploadAttachment = async (
  uri: string,
  name: string,
  mimeType: string,
  bucket: string = 'task_attachments',
  userId: string,
  currentTotalBytes: number = 0,
  knownSize?: number
): Promise<{ 
  url: string; 
  name: string; 
  type: string; 
  size: number; 
  mimeType: string; 
  storagePath: string 
}> => {
  const validation = validateAttachment({ name, size: knownSize, mimeType }, currentTotalBytes);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const safeFilename = (name || 'attachment').replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `${userId}/${Date.now()}_${safeFilename}`;
  
  const url = await uploadAttachmentBinary(uri, bucket, storagePath, mimeType, safeFilename);
  return { 
    url, 
    name, 
    type: validation.extension, 
    size: knownSize || 0, 
    mimeType: mimeType || 'application/octet-stream', 
    storagePath 
  };
};

/**
 * Removes an attachment from MinIO via FastAPI /storage/delete (self-hosted, no Supabase).
 */
export const deleteStorageAttachment = async (
  fileUrlOrPath: string,
  bucket: string = 'task-attachments'
): Promise<void> => {
  try {
    let storagePath = fileUrlOrPath;
    // Extract path component if a full URL was passed
    const serveMarker = 'path=';
    if (fileUrlOrPath.includes(serveMarker)) {
      const parts = fileUrlOrPath.split(serveMarker);
      if (parts.length > 1) {
        storagePath = decodeURIComponent(parts[1]);
      }
    }
    if (storagePath) {
      await apiClient.post('/storage/delete', { bucket, paths: [storagePath] });
    }
  } catch (err) {
    console.warn('[AttachmentPipeline] Could not delete storage object:', err);
  }
};
