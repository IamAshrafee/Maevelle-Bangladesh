import { AnnouncementBar } from '@/components/layout/announcement-bar';
import { HeaderClientShell } from '@/components/layout/header-client-shell';
import { loadPublicCategories, loadPublicStorefrontContext } from '@/lib/api/server/catalog';

export async function StorefrontHeader() {
  const navigation = await loadPublicStorefrontContext()
    .then(async (context) => ({
      storeName: context.storeName,
      announcement: context.announcement,
      categories: await loadPublicCategories(context.organizationId),
    }))
    .catch(() => ({ storeName: 'Maevelle', announcement: undefined, categories: [] }));

  return (
    <>
      <AnnouncementBar announcement={navigation.announcement} />
      <HeaderClientShell
        categories={navigation.categories}
        storeName={navigation.storeName}
      />
    </>
  );
}
