import type { ComponentProps, ReactNode } from 'react';
import Link from 'next/link';

import { cx } from '@/components/ui/classnames';
import { ChevronRightIcon } from '@/components/ui/icons';

export interface BreadcrumbItemDef {
  readonly label: string;
  readonly href?: string;
  readonly current?: boolean;
}

export interface BreadcrumbProps extends ComponentProps<'nav'> {
  readonly items?: readonly BreadcrumbItemDef[];
  readonly separator?: ReactNode;
  readonly children?: ReactNode;
}

export function Breadcrumb({
  items,
  separator = <ChevronRightIcon size={12} className="opacity-60" />,
  className,
  children,
  ...props
}: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cx('min-w-0 w-full', className)}
      {...props}
    >
      <ol className="flex items-center flex-wrap gap-1.5 text-[12px] sm:text-[13px] text-on-surface-variant font-normal leading-normal">
        {items
          ? items.map((item, index) => {
              const isLast = index === items.length - 1;
              const isCurrent = item.current ?? isLast;
              return (
                <li
                  key={`${item.label}-${index}`}
                  className="inline-flex items-center gap-1.5 min-w-0"
                >
                  {index > 0 && (
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-outline-variant flex items-center select-none"
                    >
                      {separator}
                    </span>
                  )}
                  {isCurrent || !item.href ? (
                    <span
                      aria-current="page"
                      className="font-medium text-on-surface truncate max-w-[170px] sm:max-w-[280px] md:max-w-[420px]"
                      title={item.label}
                    >
                      {item.label}
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className="text-on-surface-variant hover:text-primary transition-colors duration-150 whitespace-nowrap focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-primary rounded-xs"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              );
            })
          : children}
      </ol>
    </nav>
  );
}

export function BreadcrumbList({ className, ...props }: ComponentProps<'ol'>) {
  return (
    <ol
      className={cx(
        'flex items-center flex-wrap gap-1.5 text-[12px] sm:text-[13px] text-on-surface-variant font-normal leading-normal',
        className,
      )}
      {...props}
    />
  );
}

export function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>) {
  return <li className={cx('inline-flex items-center gap-1.5 min-w-0', className)} {...props} />;
}

export type BreadcrumbLinkProps = ComponentProps<typeof Link>;

export function BreadcrumbLink({
  className,
  href,
  children,
  ...props
}: BreadcrumbLinkProps) {
  return (
    <Link
      href={href}
      className={cx(
        'text-on-surface-variant hover:text-primary transition-colors duration-150 whitespace-nowrap focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-primary rounded-xs',
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

export function BreadcrumbCurrent({
  className,
  children,
  ...props
}: ComponentProps<'span'>) {
  return (
    <span
      aria-current="page"
      className={cx(
        'font-medium text-on-surface truncate max-w-[170px] sm:max-w-[280px] md:max-w-[420px]',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function BreadcrumbSeparator({
  className,
  children = <ChevronRightIcon size={12} className="opacity-60" />,
  ...props
}: ComponentProps<'span'>) {
  return (
    <span
      aria-hidden="true"
      className={cx('shrink-0 text-outline-variant flex items-center select-none', className)}
      {...props}
    >
      {children}
    </span>
  );
}

Breadcrumb.List = BreadcrumbList;
Breadcrumb.Item = BreadcrumbItem;
Breadcrumb.Link = BreadcrumbLink;
Breadcrumb.Current = BreadcrumbCurrent;
Breadcrumb.Page = BreadcrumbCurrent;
Breadcrumb.Separator = BreadcrumbSeparator;
