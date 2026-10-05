import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';

type SectionProps = ComponentProps<'section'> & {
  spacing?: 'compact' | 'default' | 'editorial';
};

const spacing: Record<NonNullable<SectionProps['spacing']>, string> = {
  compact: 'py-8 md:py-10',
  default: 'py-12 md:py-16',
  editorial: 'py-16 md:py-24',
};

export function Section({
  className,
  spacing: sectionSpacing = 'default',
  ...props
}: SectionProps) {
  return <section className={cx(spacing[sectionSpacing], className)} {...props} />;
}
