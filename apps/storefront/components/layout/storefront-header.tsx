import Link from 'next/link';

import { CartIndicator } from '@/components/navigation/cart-indicator';
import { MobileNavigation } from '@/components/navigation/mobile-navigation';
import { loadPublicCategories, loadPublicStorefrontContext } from '@/lib/api/server/catalog';

export async function StorefrontHeader() {
  const navigation = await loadPublicStorefrontContext()
    .then(async (context) => ({
      storeName: context.storeName,
      announcement: context.announcement,
      categories: await loadPublicCategories(context.organizationId),
    }))
    .catch(() => ({ storeName: 'Maevelle', announcement: undefined, categories: [] }));
  const { categories } = navigation;
  const primaryCategories = categories.filter((category) => category.depth === 0).slice(0, 6);

  return (
    <>
      {navigation.announcement ? <p className="announcement">{navigation.announcement}</p> : null}
      <header className="site-header">
        <div className="header-main">
          <MobileNavigation categories={categories} />
          <Link className="brand" href="/" aria-label={`${navigation.storeName} home`}>
            {navigation.storeName}
          </Link>
          <nav className="desktop-navigation" aria-label="Primary navigation">
            {primaryCategories.map((category) => (
              <Link key={category.id} href={`/categories/${category.path}`}>
                {category.name}
              </Link>
            ))}
            <Link href="/categories">Shop all</Link>
          </nav>
          <div className="header-actions">
            <details className="relative">
              <summary className="icon-button cursor-pointer list-none" aria-label="Search">
                <span aria-hidden="true">⌕</span>
              </summary>
              <form
                action="/search"
                className="absolute right-0 z-30 mt-2 grid w-[min(24rem,calc(100vw-2rem))] gap-3 rounded border border-stone-200 bg-white p-4 shadow-lg"
                role="search"
              >
                <label htmlFor="site-search">Search products</label>
                <input
                  id="site-search"
                  name="q"
                  type="search"
                  placeholder="Product, style, or SKU"
                />
                <button type="submit">Search</button>
              </form>
            </details>
            <CartIndicator />
          </div>
        </div>
      </header>
    </>
  );
}
