import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdminCapabilitiesProvider, useAdminCapability } from '../components/admin-capabilities';

function InventoryCommand() {
  return useAdminCapability('inventory.adjust') ? <span>Adjust Stock</span> : null;
}

describe('Admin capability rendering', () => {
  it('renders a protected Inventory command only when the active context grants it', () => {
    expect(
      renderToStaticMarkup(
        <AdminCapabilitiesProvider capabilities={['inventory.view']}>
          <InventoryCommand />
        </AdminCapabilitiesProvider>,
      ),
    ).toBe('');
    expect(
      renderToStaticMarkup(
        <AdminCapabilitiesProvider capabilities={['inventory.view', 'inventory.adjust']}>
          <InventoryCommand />
        </AdminCapabilitiesProvider>,
      ),
    ).toContain('Adjust Stock');
  });
});
