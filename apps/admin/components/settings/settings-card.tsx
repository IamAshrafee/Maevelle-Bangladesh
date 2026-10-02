'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SettingsCardProps {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly icon?: LucideIcon;
  readonly badge?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
}

export function SettingsCard({
  title,
  description,
  icon: Icon,
  badge,
  actions,
  children,
  className,
  contentClassName,
}: SettingsCardProps) {
  return (
    <Card className={cn('border-border shadow-xs overflow-hidden', className)}>
      {(title || description || actions || badge) && (
        <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-4 border-b bg-muted/20">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {Icon && <Icon className="size-4.5 text-primary shrink-0" />}
              <CardTitle className="text-base font-medium text-foreground">{title}</CardTitle>
              {badge}
            </div>
            {description && (
              <CardDescription className="text-xs text-muted-foreground leading-relaxed">
                {description}
              </CardDescription>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={cn('pt-5', contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <h2 className="text-base font-semibold text-foreground tracking-tight">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
