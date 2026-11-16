import * as React from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-foreground dark:text-primary-foreground shadow-xs hover:bg-primary-hover hover:text-primary-foreground border border-primary/20',
        secondary:
          'bg-secondary text-secondary-foreground border border-border/80 shadow-2xs hover:bg-secondary/70 hover:border-border',
        outline:
          'border border-border bg-card text-foreground shadow-2xs hover:bg-muted hover:text-foreground',
        glass:
          'bg-card/75 backdrop-blur-md border border-border/70 text-foreground shadow-2xs hover:bg-card hover:border-border',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        destructive:
          'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 border border-destructive/20',
        link: 'text-primary underline-offset-4 hover:underline p-0 h-auto shadow-none',
      },
      size: {
        default: 'h-11 md:h-9 pointer-coarse:min-h-11 gap-2 px-3.5 text-sm',
        xs: "h-9 md:h-7 pointer-coarse:min-h-10 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-10 md:h-8 pointer-coarse:min-h-11 gap-1.5 rounded-lg px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-12 md:h-10 pointer-coarse:min-h-12 gap-2.5 rounded-lg px-4 text-sm font-semibold',
        icon: 'size-11 md:size-9 pointer-coarse:size-11 rounded-lg',
        'icon-xs':
          "size-9 md:size-7 pointer-coarse:size-10 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-10 md:size-8 pointer-coarse:size-11 rounded-lg',
        'icon-lg': 'size-12 md:size-10 pointer-coarse:size-12 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  render,
  nativeButton,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      render={render}
      nativeButton={render ? false : nativeButton}
      {...props}
    />
  );
}

export { Button, buttonVariants };
