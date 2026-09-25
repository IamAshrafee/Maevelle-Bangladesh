# Media Completion Context

Media began as an Admin Product-image upload shortcut: the API buffered files,
wrote local paths, marked assets ready immediately, and exposed no reusable
upload lifecycle, processing recovery, document support, organization tools, or
safe deletion. Product placement existed, but storage, asset identity, and
business usage were not cleanly separated.

The authoritative target is `docs/domains/media/media-architecture.md`. Current
consumers are Catalog/Product, Storefront/Cart, and customer Reviews. Supply,
Finance, and other operational areas currently have no file/attachment fields;
when those workflows are introduced, their domains must own typed relationship
semantics while reusing the shared Media upload and delivery infrastructure.
