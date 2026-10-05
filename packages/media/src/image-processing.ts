import sharp from 'sharp';

import { sha256 } from './storage.js';

export const MAX_IMAGE_PIXELS = 40_000_000;

export interface ProcessedImageMetadata {
  readonly width: number;
  readonly height: number;
  readonly format: 'jpeg' | 'png' | 'webp';
}

export interface ProcessedImageRendition {
  readonly key: 'thumbnail' | 'card' | 'pdp' | 'zoom';
  readonly width: number;
  readonly height: number;
  readonly mimeType: 'image/webp';
  readonly extension: 'webp';
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly content: Buffer;
}

const RENDITIONS = [
  { key: 'thumbnail', width: 320, quality: 78 },
  { key: 'card', width: 640, quality: 80 },
  { key: 'pdp', width: 1280, quality: 84 },
  { key: 'zoom', width: 2400, quality: 86 },
] as const;

export class InvalidImageError extends Error {
  public constructor(
    public readonly code: 'UNSUPPORTED_IMAGE' | 'IMAGE_DIMENSIONS_TOO_LARGE' | 'CORRUPT_IMAGE',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidImageError';
  }
}

export function validateMediaSignature(buffer: Buffer, declaredMimeType: string): boolean {
  if (buffer.length < 12) return false;
  switch (declaredMimeType) {
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/png':
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );
    case 'image/webp':
      return (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'application/pdf':
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    default:
      return false;
  }
}

export async function inspectAndProcessImage(content: Buffer): Promise<{
  readonly metadata: ProcessedImageMetadata;
  readonly renditions: readonly ProcessedImageRendition[];
}> {
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    metadata = await sharp(content, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/pixel limit|dimensions/i.test(message))
      throw new InvalidImageError(
        'IMAGE_DIMENSIONS_TOO_LARGE',
        'Image dimensions exceed the processing safety limit.',
      );
    throw new InvalidImageError('CORRUPT_IMAGE', 'The uploaded image could not be decoded.');
  }
  if (!metadata.width || !metadata.height || !metadata.format)
    throw new InvalidImageError('CORRUPT_IMAGE', 'The uploaded image has no usable dimensions.');
  if (!['jpeg', 'png', 'webp'].includes(metadata.format))
    throw new InvalidImageError(
      'UNSUPPORTED_IMAGE',
      'Only JPEG, PNG, and WebP images are supported.',
    );
  if (metadata.width * metadata.height > MAX_IMAGE_PIXELS)
    throw new InvalidImageError(
      'IMAGE_DIMENSIONS_TOO_LARGE',
      'Image dimensions exceed the processing safety limit.',
    );

  const renditions = await Promise.all(
    RENDITIONS.map(async (rendition) => {
      // autoOrient applies EXIF orientation. Sharp omits source EXIF from output unless
      // metadata is explicitly retained, keeping public renditions privacy-safe.
      const result = await sharp(content, { limitInputPixels: MAX_IMAGE_PIXELS })
        .autoOrient()
        .resize({ width: rendition.width, withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: rendition.quality, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      return {
        key: rendition.key,
        width: result.info.width,
        height: result.info.height,
        mimeType: 'image/webp' as const,
        extension: 'webp' as const,
        byteSize: result.data.length,
        checksumSha256: sha256(result.data),
        content: result.data,
      };
    }),
  );
  return {
    metadata: {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format as ProcessedImageMetadata['format'],
    },
    renditions,
  };
}

/** Processes, crops to square, strips EXIF, and encodes an avatar image to 256x256 WebP. */
export async function processAvatarImage(content: Buffer): Promise<{
  readonly content: Buffer;
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly width: number;
  readonly height: number;
}> {
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    metadata = await sharp(content, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/pixel limit|dimensions/i.test(message))
      throw new InvalidImageError(
        'IMAGE_DIMENSIONS_TOO_LARGE',
        'Image dimensions exceed the processing safety limit.',
      );
    throw new InvalidImageError('CORRUPT_IMAGE', 'The uploaded image could not be decoded.');
  }
  if (!metadata.width || !metadata.height || !metadata.format)
    throw new InvalidImageError('CORRUPT_IMAGE', 'The uploaded image has no usable dimensions.');
  if (!['jpeg', 'png', 'webp'].includes(metadata.format))
    throw new InvalidImageError(
      'UNSUPPORTED_IMAGE',
      'Only JPEG, PNG, and WebP images are supported for profile avatars.',
    );

  const result = await sharp(content, { limitInputPixels: MAX_IMAGE_PIXELS })
    .autoOrient()
    .resize({ width: 256, height: 256, fit: 'cover', position: 'center' })
    .webp({ quality: 85, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    content: result.data,
    byteSize: result.data.length,
    checksumSha256: sha256(result.data),
    width: result.info.width,
    height: result.info.height,
  };
}

