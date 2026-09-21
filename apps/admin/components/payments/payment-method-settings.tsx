'use client';

import { Banknote } from 'lucide-react';

import type { PaymentMethodDto } from '@maevelle/contracts';

import { StatusBadge } from '../status-badge';

interface PaymentMethodSettingsProps {
  readonly methods: readonly PaymentMethodDto[];
  readonly busy: boolean;
  readonly onSave: (method: PaymentMethodDto, form: HTMLFormElement) => void | Promise<void>;
}

export function PaymentMethodSettings({ methods, busy, onSave }: PaymentMethodSettingsProps) {
  return (
    <section className="method-grid">
      {methods.map((method) => (
        <form
          className="panel"
          key={method.id}
          onSubmit={(event) => {
            event.preventDefault();
            void onSave(method, event.currentTarget);
          }}
        >
          <header className="panel-header">
            <div>
              <p className="eyebrow">{method.code}</p>
              <h2>{method.name}</h2>
            </div>
            <StatusBadge status={method.status} />
          </header>
          <label>
            Name
            <input defaultValue={method.name} name="name" required />
          </label>
          <div className="form-row">
            <label>
              Status
              <select defaultValue={method.status} name="status">
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </label>
            <label>
              Display order
              <input
                defaultValue={method.displayOrder}
                min={0}
                name="displayOrder"
                type="number"
                required
              />
            </label>
          </div>
          {method.code !== 'COD' ? (
            <>
              <label>
                Payment window in minutes
                <input
                  defaultValue={method.paymentWindowMinutes ?? 1440}
                  min={15}
                  max={10080}
                  name="paymentWindowMinutes"
                  type="number"
                  required
                />
                <span className="cell-secondary">
                  Unpaid orders expire after this window. Submitted references awaiting review do
                  not expire.
                </span>
              </label>
              <label>
                Customer-visible wallet number
                <input
                  defaultValue={method.instructions.accountNumber}
                  inputMode="numeric"
                  name="accountNumber"
                />
              </label>
              <label>
                Checkout instructions
                <textarea defaultValue={method.instructions.text} name="instructions" />
              </label>
            </>
          ) : (
            <p className="muted">
              Cash on delivery collects funds after successful delivery and never creates a fake
              paid state.
            </p>
          )}
          <button className="button primary" disabled={busy} type="submit">
            <Banknote aria-hidden="true" /> Save method
          </button>
        </form>
      ))}
    </section>
  );
}
