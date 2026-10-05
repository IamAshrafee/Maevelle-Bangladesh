import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Price } from '@/components/commerce/price';
import { Container } from '@/components/layout/container';
import { Section } from '@/components/layout/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChoiceChip, Chip, ColorSwatch } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Checkbox, Radio } from '@/components/ui/selection-control';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Surface } from '@/components/ui/surface';
import { Textarea } from '@/components/ui/textarea';
import { Heading, Text } from '@/components/ui/typography';

export const metadata: Metadata = {
  title: 'Storefront Design System Lab',
  robots: { index: false, follow: false },
};

const swatches = [
  ['Primary', 'bg-primary', '#7E0E35'],
  ['Rose', 'bg-berry-700', '#9E2A4B'],
  ['Blush', 'bg-blush', '#F8E8ED'],
  ['Linen', 'bg-linen', '#F7F0EA'],
  ['Canvas', 'bg-background', '#FFFAF7'],
  ['Espresso', 'bg-espresso', '#291C20'],
] as const;

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 20 20" width="20">
      <path
        d="M4 10h12m-4-4 4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 20 20" width="20">
      <path
        d="m5 5 10 10M15 5 5 15"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export default function StorefrontDesignSystemPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="bg-background text-foreground">
      <Section spacing="editorial">
        <Container>
          <Badge variant="brand">Development only</Badge>
          <Heading className="mt-5 max-w-4xl" level={1} variant="display">
            Maevelle Storefront visual foundation
          </Heading>
          <Text className="mt-5 max-w-2xl" size="lg">
            The canonical light-theme tokens and production primitives for a warm, premium,
            mobile-first commerce experience.
          </Text>
        </Container>
      </Section>

      <Section
        className="border-y border-border-subtle bg-surface"
        aria-labelledby="lab-colors"
        spacing="default"
      >
        <Container>
          <Heading id="lab-colors" level={2} variant="heading-lg">
            Color
          </Heading>
          <Text className="mt-3 max-w-2xl">
            Semantic application colors are the public API. Raw brand swatches exist for identity
            reference and rare artwork.
          </Text>
          <div className="mt-8 grid grid-cols-2 gap-grid sm:grid-cols-3 lg:grid-cols-6">
            {swatches.map(([name, colorClass, value]) => (
              <Surface className="overflow-hidden" key={name}>
                <div className={`aspect-[4/3] ${colorClass}`} aria-hidden="true" />
                <div className="p-3">
                  <p className="m-0 text-label font-semibold">{name}</p>
                  <p className="m-0 mt-1 text-caption text-foreground-muted" translate="no">
                    {value}
                  </p>
                </div>
              </Surface>
            ))}
          </div>
        </Container>
      </Section>

      <Section aria-labelledby="lab-type">
        <Container>
          <Heading id="lab-type" level={2} variant="heading-lg">
            Typography
          </Heading>
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div className="grid gap-5">
              <Heading level={3} variant="display">
                Quietly distinctive.
              </Heading>
              <Heading level={3} variant="heading-lg">
                A considered wardrobe
              </Heading>
              <Heading level={3} variant="heading-md">
                Everyday pieces, thoughtfully chosen
              </Heading>
              <Heading level={3} variant="heading-sm">
                Product information
              </Heading>
              <Text size="lg">
                Comfortable body copy for editorial introductions and important explanations.
              </Text>
              <Text>Functional body copy stays in Plus Jakarta Sans for effortless scanning.</Text>
              <Text size="sm">
                Supporting metadata remains readable in bright light and on smaller displays.
              </Text>
            </div>
            <Surface className="grid content-start gap-5 p-6" variant="raised">
              <Heading level={3} variant="heading-md">
                Bangladesh market typography
              </Heading>
              <p className="m-0 text-heading-md font-semibold" lang="bn">
                আপনার প্রতিদিনের সাজে নতুন মাত্রা
              </p>
              <p className="m-0 text-body-md" lang="bn">
                সুন্দর, আরামদায়ক ও যত্ন করে বাছাই করা অ্যাকসেসরিজ।
              </p>
              <Text>
                Maevelle — <span lang="bn">আপনার নিজের মতো</span>
              </Text>
              <Price amount="1490" originalAmount="1790" size="lg" />
            </Surface>
          </div>
        </Container>
      </Section>

      <Section className="bg-surface-muted" aria-labelledby="lab-actions">
        <Container>
          <Heading id="lab-actions" level={2} variant="heading-lg">
            Actions & choices
          </Heading>
          <div className="mt-8 grid gap-8">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary action</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Destructive</Button>
              <Button disabled>Disabled</Button>
              <Button loading>Adding…</Button>
              <Button>
                <span>Continue</span>
                <ArrowRightIcon />
              </Button>
              <IconButton aria-label="Close panel" variant="outline">
                <CloseIcon />
              </IconButton>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge>Neutral</Badge>
              <Badge variant="brand">New</Badge>
              <Badge variant="success">In stock</Badge>
              <Badge variant="warning">Low stock</Badge>
              <Badge variant="danger">Unavailable</Badge>
              <Badge variant="info">Verified</Badge>
              <Chip>Accessories</Chip>
              <ChoiceChip>Small</ChoiceChip>
              <ChoiceChip selected>Medium</ChoiceChip>
              <ChoiceChip disabled>Large</ChoiceChip>
              <ColorSwatch aria-label="Berry" color="#7e0e35" selected />
              <ColorSwatch aria-label="Warm sand" color="#d9c3ad" />
              <ColorSwatch aria-label="Black" color="#191619" unavailable />
            </div>
          </div>
        </Container>
      </Section>

      <Section aria-labelledby="lab-forms">
        <Container>
          <Heading id="lab-forms" level={2} variant="heading-lg">
            Forms
          </Heading>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <Field
              description="We’ll only use this for delivery updates."
              id="lab-phone"
              label="Mobile number"
              required
            >
              <Input
                autoComplete="tel"
                inputMode="tel"
                name="phone"
                placeholder="Example: 01712 345678…"
                type="tel"
              />
            </Field>
            <Field
              error="Enter a complete delivery area."
              id="lab-area"
              label="Delivery area"
              required
            >
              <Input autoComplete="address-level2" name="area" placeholder="Example: Dhanmondi…" />
            </Field>
            <Field id="lab-city" label="City">
              <Select defaultValue="dhaka" name="city">
                <option value="dhaka">Dhaka</option>
                <option value="chattogram">Chattogram</option>
                <option value="sylhet">Sylhet</option>
              </Select>
            </Field>
            <Field
              description="Optional — include landmarks that help the courier."
              id="lab-note"
              label="Delivery note"
            >
              <Textarea
                autoComplete="off"
                name="note"
                placeholder="Example: Building name, floor, or nearby landmark…"
              />
            </Field>
          </div>
          <fieldset className="mt-8 grid gap-2 border-0 p-0">
            <legend className="mb-2 text-label font-semibold">Delivery preference</legend>
            <Checkbox defaultChecked label="Send order updates by SMS" name="sms-updates" />
            <Radio defaultChecked label="Standard delivery" name="delivery" value="standard" />
            <Radio
              description="Available in selected Dhaka areas."
              label="Express delivery"
              name="delivery"
              value="express"
            />
          </fieldset>
        </Container>
      </Section>

      <Section className="bg-surface-muted" aria-labelledby="lab-feedback">
        <Container>
          <Heading id="lab-feedback" level={2} variant="heading-lg">
            Feedback, surfaces & loading
          </Heading>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Notice title="Order updated" variant="success">
              Your delivery preference was saved.
            </Notice>
            <Notice title="Check this detail" variant="warning">
              The selected color has limited stock.
            </Notice>
            <Notice title="We couldn’t save your address" variant="danger">
              Check your connection and try again.
            </Notice>
            <Notice title="Good to know" variant="info">
              Final availability is confirmed when you add to bag.
            </Notice>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            <Surface className="p-5">
              <Text size="sm">Flat surface</Text>
            </Surface>
            <Surface className="p-5" variant="raised">
              <Text size="sm">Raised surface</Text>
            </Surface>
            <Surface className="p-5" variant="floating">
              <Text size="sm">Floating surface</Text>
            </Surface>
            <Surface className="p-5" variant="inverse">
              <p className="m-0 text-body-sm">Inverse surface</p>
            </Surface>
          </div>
          <Surface className="mt-8 grid max-w-sm gap-4 p-5" variant="raised">
            <Skeleton className="aspect-[3/4] w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
            <div className="flex items-center gap-3 text-body-sm text-foreground-muted">
              <Spinner />
              Loading product details…
            </div>
          </Surface>
          <Separator className="mt-10" />
          <Text className="mt-5" size="sm">
            Resize this page to inspect the 16 px mobile gutter, 24 px desktop gutter, fluid type,
            and responsive grids.
          </Text>
        </Container>
      </Section>
    </main>
  );
}
