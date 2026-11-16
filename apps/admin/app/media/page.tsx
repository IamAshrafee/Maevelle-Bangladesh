import { Suspense } from 'react';
import { MediaLibraryConsole } from '@/components/media/media-library-console';
import { PageSkeleton } from '@/components/ui/page-shell';

export default function MediaPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" widthVariant="wide" />}>
      <MediaLibraryConsole />
    </Suspense>
  );
}
