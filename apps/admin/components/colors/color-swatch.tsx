import { isLightColor } from './color-types';

interface ColorSwatchProps {
  name?: string | undefined;
  hexValue?: string | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl' | undefined;
  showHex?: boolean | undefined;
  className?: string | undefined;
}

const sizeClasses = {
  sm: 'size-4 rounded-full',
  md: 'size-6 rounded-md',
  lg: 'size-10 rounded-lg',
  xl: 'size-14 rounded-xl',
};

export function ColorSwatch({
  name,
  hexValue,
  size = 'md',
  showHex = false,
  className = '',
}: ColorSwatchProps) {
  const hasHex = Boolean(hexValue && /^#[0-9a-fA-F]{6}$/.test(hexValue));
  const isLight = isLightColor(hexValue);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span
        aria-hidden="true"
        className={`shrink-0 border shadow-xs transition-transform ${sizeClasses[size]} ${
          isLight ? 'border-foreground/20' : 'border-black/10'
        }`}
        style={{
          backgroundColor: hasHex ? hexValue! : 'transparent',
          backgroundImage: hasHex
            ? undefined
            : 'repeating-linear-gradient(45deg, #ccc, #ccc 2px, transparent 2px, transparent 6px)',
        }}
      />
      {(name || (showHex && hasHex)) && (
        <span className="min-w-0">
          {name && <span className="block truncate font-medium text-sm">{name}</span>}
          {showHex && hasHex && (
            <span className="block font-mono text-xs text-muted-foreground">{hexValue}</span>
          )}
        </span>
      )}
    </div>
  );
}
