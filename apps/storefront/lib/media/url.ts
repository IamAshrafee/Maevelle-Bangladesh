import type { MediaRenditionKeyDto } from '@maevelle/contracts';

export function publicMediaPath(assetId: string, rendition?: MediaRenditionKeyDto): string {
  // This stable discovery URL redirects without caching to the current
  // content-fingerprinted rendition, so cached catalog pages remain valid.
  const path = `/api/media/public/${encodeURIComponent(assetId)}`;
  return rendition ? `${path}?rendition=${rendition}` : path;
}
