import type { ProductRecommendationsDto } from '@maevelle/contracts';
import { Container } from '@/components/layout/container';
import { loadProductRecommendations } from '@/lib/api/server/recommendations';
import { RecommendationSection } from './recommendation-section';

export async function PdpRecommendations({
  handle,
  organizationId,
  currency,
}: {
  handle: string;
  organizationId: string;
  currency: string;
}) {
  const result: ProductRecommendationsDto | null = await loadProductRecommendations(
    handle,
    organizationId,
    currency,
  );
  const visible = result?.sections.filter((section) => section.items.length > 0) ?? [];
  if (!result || !visible.length) return null;
  return (
    <div className="border-t border-border py-8 sm:py-12">
      <Container className="space-y-10 sm:space-y-14">
        {visible.map((section) => (
          <RecommendationSection
            key={section.placement}
            section={section}
            requestId={result.recommendationRequestId}
          />
        ))}
      </Container>
    </div>
  );
}
