import type { MediaRenditionKeyDto } from '@maevelle/contracts';

export function publicMediaPath(assetId: string, rendition?: MediaRenditionKeyDto): string {
  const path = `/api/media/public/${encodeURIComponent(assetId)}`;
  return rendition ? `${path}?rendition=${rendition}` : path;
}
