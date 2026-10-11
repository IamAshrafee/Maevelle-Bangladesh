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
    <HeaderClientShell
      announcement={navigation.announcement}
      categories={navigation.categories}
      storeName={navigation.storeName}
    />
  );
}
