'use client';

export function PrivacyChoices() {
  return (
    <button
      type="button"
      data-privacy-entry
      className="inline-flex min-h-12 items-center text-sm text-on-surface-variant underline transition-colors duration-150 hover:text-primary"
      onClick={() => window.dispatchEvent(new Event('maevelle:open-consent'))}
    >
      Privacy choices
    </button>
  );
}
