import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg text-sm font-semibold whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-b from-teal-500 to-teal-600 text-white border border-teal-600 shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.35),0_2px_8px_0_rgba(13,148,136,0.25)] hover:from-teal-600 hover:to-teal-700 hover:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.45),0_4px_14px_0_rgba(13,148,136,0.35)]',
        secondary:
          'bg-white/80 backdrop-blur-md text-foreground border border-slate-200/90 shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.95),0_1px_3px_0_rgba(15,23,42,0.04)] hover:bg-white hover:border-slate-300 hover:shadow-[inset_0_1px_1px_0_rgba(255,255,255,1),0_4px_12px_0_rgba(15,23,42,0.06)]',
        outline:
          'border border-slate-200/90 bg-white/40 backdrop-blur-sm text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)] hover:bg-white/90 hover:border-slate-300 hover:text-foreground',
        glass:
          'bg-white/70 backdrop-blur-xl border border-white/60 text-foreground shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.9),0_4px_16px_0_rgba(15,23,42,0.06)] hover:bg-white/90 hover:border-white/80 hover:shadow-[inset_0_1px_1px_0_rgba(255,255,255,1),0_6px_20px_0_rgba(15,23,42,0.1)]',
        ghost:
          'text-muted-foreground hover:bg-slate-100/70 hover:text-foreground backdrop-blur-sm',
        destructive:
          'bg-gradient-to-b from-rose-500 to-rose-600 text-white border border-rose-600 shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.35),0_2px_8px_0_rgba(225,29,72,0.25)] hover:from-rose-600 hover:to-rose-700 hover:shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.45),0_4px_14px_0_rgba(225,29,72,0.35)]',
        link: 'text-primary underline-offset-4 hover:underline p-0 h-auto shadow-none',
      },
      size: {
        default: 'h-9 gap-2 px-3.5 text-[0.8125rem]',
        xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-lg px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-10 gap-2.5 rounded-xl px-4 text-sm',
        icon: 'size-9 min-h-9 rounded-lg',
        'icon-xs': "size-6 min-h-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8 min-h-8 rounded-lg',
        'icon-lg': 'size-10 min-h-10 rounded-xl',
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
