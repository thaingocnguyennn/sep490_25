import path from 'path';
import fs from 'fs';
import { config } from '../../config';
import { BadRequestError } from '../exceptions/app-error';

// Check if Supabase storage is configured
const isSupabaseConfigured = () => {
  return !!(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

/**
 * Upload a file to local disk storage (development).
 * Returns the relative URL path for the file.
 */
export const uploadToLocal = (file: Express.Multer.File): string => {
  const fileUrl = `/uploads/${file.filename}`;
  return fileUrl;
};

/**
 * Upload a file to Supabase Storage (production).
 * Returns the public URL for the file.
 *
 * Note: This is a placeholder implementation. To use Supabase Storage:
 * 1. Create a bucket called 'documents' in Supabase Storage
 * 2. Make the bucket public
 * 3. Set the environment variables SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
export const uploadToSupabase = async (file: Express.Multer.File): Promise<string> => {
  if (!isSupabaseConfigured()) {
    throw new BadRequestError('Supabase Storage is not configured. Please set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }

  try {
    // @ts-ignore
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const fileBuffer = fs.readFileSync(file.path);
    const filePath = `documents/${Date.now()}-${file.originalname}`;

    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, fileBuffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new BadRequestError(`Failed to upload to Supabase: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    // Clean up local temp file
    fs.unlinkSync(file.path);

    return urlData.publicUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new BadRequestError(`Supabase upload failed: ${message}`);
  }
};

/**
 * Delete a file from Supabase Storage.
 */
export const deleteFromSupabase = async (fileUrl: string): Promise<void> => {
  if (!isSupabaseConfigured()) {
    return; // Skip if not configured
  }

  try {
    // @ts-ignore
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Extract file path from URL
    const urlObj = new URL(fileUrl);
    const filePath = urlObj.pathname.split('/storage/v1/object/')[1];

    if (filePath) {
      await supabase.storage.from('documents').remove([filePath]);
    }
  } catch {
    // Silently fail - file might not exist
  }
};

/**
 * Check if a URL is a Supabase URL (external storage) vs local.
 */
export const isExternalUrl = (url: string): boolean => {
  return url.startsWith('http://') || url.startsWith('https://');
};

/**
 * Get the appropriate upload handler based on configuration.
 */
export const uploadHandler = isSupabaseConfigured() ? uploadToSupabase : uploadToLocal;
