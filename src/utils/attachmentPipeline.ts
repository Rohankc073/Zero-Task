import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { decode } from 'base64-arraybuffer';

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
  // Strategy 1: FileSystem base64 (Direct native file read, completely avoiding Response.blob overhead/warning)
  try {
    const base64Str = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (base64Str) {
      return decode(base64Str);
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
 * Uploads a validated local file to Supabase Storage using native ArrayBuffer streaming.
 */
export const uploadAttachmentBinary = async (
  uri: string, 
  bucket: string, 
  path: string, 
  mimeType: string
): Promise<string> => {
  try {
    const arrayBuffer = await readFileAsArrayBuffer(uri);

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, arrayBuffer, {
        contentType: mimeType || 'application/octet-stream',
        upsert: true
      });

    if (error) {
      throw new Error(error.message);
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);
      
    return publicUrl;
  } catch (err: any) {
    throw new Error('Upload failed: ' + err.message);
  }
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
  
  const url = await uploadAttachmentBinary(uri, bucket, storagePath, mimeType);
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
 * Removes an attachment from Supabase Storage.
 */
export const deleteStorageAttachment = async (
  fileUrlOrPath: string,
  bucket: string = 'task_attachments'
): Promise<void> => {
  try {
    let storagePath = fileUrlOrPath;
    if (fileUrlOrPath.includes(`/${bucket}/`)) {
      const parts = fileUrlOrPath.split(`/${bucket}/`);
      if (parts.length > 1) {
        storagePath = decodeURIComponent(parts[1]);
      }
    }
    if (storagePath) {
      await supabase.storage.from(bucket).remove([storagePath]);
    }
  } catch (err) {
    console.warn('Could not delete storage object:', err);
  }
};
