import { LocalObjectStorage } from './local-storage.js';
import { S3ObjectStorage } from './s3-storage.js';
import type { ObjectStoragePort } from './storage.js';

export type ObjectStorageConfiguration =
  | { readonly provider: 'local'; readonly rootDirectory: string }
  | {
      readonly provider: 's3';
      readonly endpoint: string;
      readonly region: string;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
      readonly privateBucket: string;
      readonly publicBucket: string;
      readonly forcePathStyle?: boolean;
    };

export function createObjectStorage(configuration: ObjectStorageConfiguration): ObjectStoragePort {
  return configuration.provider === 'local'
    ? new LocalObjectStorage(configuration.rootDirectory)
    : new S3ObjectStorage(configuration);
}
