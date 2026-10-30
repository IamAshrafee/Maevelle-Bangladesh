'use client';

export function PrivacyChoices() {
  return (
    <button
      type="button"
      className="text-xs text-on-surface-variant underline transition-colors duration-150 hover:text-primary"
      onClick={() => window.dispatchEvent(new Event('maevelle:open-consent'))}
    >
      Privacy choices
    </button>
  );
}
