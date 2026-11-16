'use client';

import { CircleHelp, Lightbulb, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface PaymentGuideProps {
  readonly title: string;
  readonly description: string;
  readonly steps: readonly string[];
  readonly tips?: readonly string[];
  readonly relatedLinks?: readonly { label: string; href: string }[];
}

export function PaymentGuide({
  title,
  description,
  steps,
  tips,
  relatedLinks,
}: PaymentGuideProps) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <CircleHelp className="h-4 w-4 text-primary" aria-hidden="true" />
        <span>How it works</span>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CircleHelp className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Operator guide & workflow instructions
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          <p className="text-muted-foreground leading-relaxed">{description}</p>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wider text-foreground uppercase">
              Standard Procedure
            </h4>
            <ol className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              {steps.map((step, idx) => (
                <li key={step} className="flex items-start gap-2.5 text-xs text-foreground">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-bold text-primary">
                    {idx + 1}
                  </span>
                  <span className="pt-0.5 leading-normal">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {tips && tips.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground uppercase">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                Best Practices & Tips
              </h4>
              <ul className="space-y-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-foreground/90">
                {tips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2">
                    <span className="text-amber-500 select-none">•</span>
                    <span className="leading-normal">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {relatedLinks && relatedLinks.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Connected Modules
              </h4>
              <div className="flex flex-wrap gap-2">
                {relatedLinks.map((link) => (
                  <Button
                    key={link.href}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    render={<Link href={link.href} />}
                  >
                    <span>{link.label}</span>
                    <ArrowUpRight className="ml-1 h-3 w-3 opacity-60" aria-hidden="true" />
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            Close guide
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
