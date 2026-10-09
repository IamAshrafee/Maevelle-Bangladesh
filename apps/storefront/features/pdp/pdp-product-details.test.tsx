import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PdpProductDetails } from './pdp-product-details';

describe('PdpProductDetails', () => {
  it('renders product description directly without collapsibles', () => {
    const html = renderToString(
      <PdpProductDetails
        description="Crafted from handwoven mulberry silk with intricate zardozi embroidery."
      />,
    );

    expect(html).toContain('The Piece');
    expect(html).toContain('Story &amp; Silhouette');
    expect(html).toContain('Crafted from handwoven mulberry silk with intricate zardozi embroidery.');
    // Must NOT have any <details> or <summary> or accordion triggers
    expect(html).not.toContain('<details');
    expect(html).not.toContain('<summary');
  });

  it('renders attribute groups and key-value specs in an open table view without card boxes or collapsibles', () => {
    const html = renderToString(
      <PdpProductDetails
        productDetails={[
          { group: 'Material & Craft', label: 'Fabric', value: '100% Pure Mulberry Silk' },
          { group: 'Material & Craft', label: 'Weave', value: 'Jamdani Handloom' },
          { group: 'Care & Preservation', label: 'Washing', value: 'Dry Clean Only' },
        ]}
      />,
    );

    expect(html).toContain('Specifications');
    expect(html).toContain('Product Details &amp; Craft');
    expect(html).toContain('Material &amp; Craft');
    // Verifies semantic table structure
    expect(html).toContain('<table');
    expect(html).toContain('<tbody');
    expect(html).toContain('<tr');
    expect(html).toContain('<th');
    expect(html).toContain('<td');
    expect(html).toContain('Fabric');
    expect(html).toContain('100% Pure Mulberry Silk');
    expect(html).toContain('Weave');
    expect(html).toContain('Jamdani Handloom');
    expect(html).toContain('Care &amp; Preservation');
    expect(html).toContain('Washing');
    expect(html).toContain('Dry Clean Only');
    // Must NOT be inside a card box or accordion
    expect(html).not.toContain('<details');
    expect(html).not.toContain('shadow-2xs');
  });

  it('renders FAQs directly in an open, unboxed list', () => {
    const html = renderToString(
      <PdpProductDetails
        productFaqs={[
          {
            question: 'How long does shipping take within Dhaka?',
            answer: 'Delivery within Dhaka takes 24 to 48 hours via express courier.',
          },
        ]}
      />,
    );

    expect(html).toContain('Client Inquiries');
    expect(html).toContain('Frequently Asked Questions');
    expect(html).toContain('How long does shipping take within Dhaka?');
    expect(html).toContain('Delivery within Dhaka takes 24 to 48 hours via express courier.');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('shadow-2xs');
  });

  it('returns null when no description, specs, or faqs are present', () => {
    const html = renderToString(
      <PdpProductDetails description="" productDetails={[]} productFaqs={[]} />,
    );

    expect(html).toBe('');
  });
});
