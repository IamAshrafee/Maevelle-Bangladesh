import {
  CheckCircle2,
  CircleDashed,
  Clock3,
  ExternalLink,
  Server,
  ShieldCheck,
  Smartphone,
  Wrench,
} from 'lucide-react';
import type { SmsDiagnosticsDto } from './sms-types';
import { formatBangladeshPhone, formatSmsDate } from './sms-types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const capabilityLabels: Readonly<Record<string, string>> = {
  SEND: 'Transactional Send',
  DELIVERY_CALLBACK: 'Delivery Callback',
  DELIVERY_STATUS_POLLING: 'Status Polling',
  MASKING_SENDER: 'Masking Sender',
  NON_MASKING_SENDER: 'Non-Masking Sender',
  UNICODE: 'Unicode / Bangla',
  BULK_SEND: 'Transport Batching',
  BALANCE_QUERY: 'Balance Query',
  COST_REPORTING: 'Cost Reporting',
  PROVIDER_IDEMPOTENCY: 'Provider Idempotency',
};

export function SmsDiagnosticsTab({
  diagnostics,
}: {
  readonly diagnostics: SmsDiagnosticsDto | undefined;
}) {
  const capabilities = new Set(diagnostics?.capabilities ?? []);
  const noProduction =
    !diagnostics?.providerConfigured ||
    diagnostics.provider === 'none' ||
    diagnostics.provider === 'mock';
  return (
    <div className="space-y-6">
      <div
        className={`rounded-2xl border p-5 ${noProduction ? 'border-blue-300 bg-blue-50 dark:bg-blue-950' : 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950'}`}
      >
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="size-7 shrink-0" />
          <div>
            <h2 className="font-semibold">
              {noProduction
                ? 'Production SMS Provider Not Selected'
                : `${diagnostics?.provider} Provider Configured`}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {noProduction
                ? 'This is an expected readiness state. Connect a provider adapter, deployment secrets, approved sender, and delivery tracking after Maevelle selects a Bangladesh provider.'
                : 'Configuration is present, but reachability, sender approval, and live delivery still require provider evidence.'}
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <DiagnosticSection
          title="Maevelle Platform"
          description="Internal SMS control-plane state."
          icon={Wrench}
        >
          <Fact label="Global Sending" value={diagnostics?.enabled ? 'Enabled' : 'Disabled'} />
          <Fact label="Environment" value={diagnostics?.environment ?? 'Unknown'} />
          <Fact label="Mode" value={diagnostics?.mode ?? 'Unavailable'} />
          <Fact label="Worker" value={diagnostics?.workerStatus ?? 'Unavailable'} />
          <Fact
            label="Last Worker Activity"
            value={formatSmsDate(diagnostics?.lastWorkerActivityAt)}
          />
          <Fact
            label="Queue"
            value={`${diagnostics?.queued ?? 0} queued · ${diagnostics?.processing ?? 0} processing`}
          />
        </DiagnosticSection>
        <DiagnosticSection
          title="Provider Truth"
          description="Selection, configuration, and evidence are deliberately separate."
          icon={Server}
        >
          <Fact
            label="Selected Adapter"
            value={diagnostics?.provider === 'none' ? 'None' : (diagnostics?.provider ?? 'Unknown')}
          />
          <Fact
            label="Credentials Present"
            value={diagnostics?.credentialsConfigured ? 'Yes' : 'No'}
          />
          <Fact label="Reachability" value="Not verified by current diagnostics" />
          <Fact
            label="Callback Configured"
            value={
              diagnostics?.callbackConfigured
                ? 'Yes'
                : noProduction
                  ? 'Pending provider selection'
                  : 'No'
            }
          />
          <Fact
            label="Last Delivery Callback"
            value={formatSmsDate(diagnostics?.lastDeliveryCallbackAt)}
          />
          <Fact
            label="Status Polling"
            value={
              diagnostics?.pollingSupported
                ? 'Supported by adapter'
                : noProduction
                  ? 'Unknown until provider selection'
                  : 'Not supported'
            }
          />
        </DiagnosticSection>
        <DiagnosticSection
          title="Sender"
          description="Configuration does not prove external sender approval."
          icon={Smartphone}
        >
          <Fact
            label="Sender Type"
            value={diagnostics?.senderType?.replaceAll('_', ' ') ?? 'Provider default'}
          />
          <Fact label="Sender ID" value={diagnostics?.senderId ?? 'Not configured'} />
          <Fact label="External Approval" value="Requires provider confirmation" />
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Masking</p>
            <p>Shows an approved brand name such as MAEVELLE.</p>
            <p className="mt-2 font-medium text-foreground">Non-Masking</p>
            <p>Uses a number or provider identity, subject to provider rules.</p>
          </div>
        </DiagnosticSection>
        <DiagnosticSection
          title="Development Safety"
          description="Deployment-managed safeguards; secrets are never returned."
          icon={ShieldCheck}
        >
          <Fact label="Mock Mode" value={diagnostics?.mode === 'MOCK' ? 'Active' : 'Inactive'} />
          <Fact
            label="Recipient Override"
            value={
              diagnostics?.recipientOverride
                ? formatBangladeshPhone(diagnostics.recipientOverride)
                : 'Disabled'
            }
          />
          <Fact
            label="Allowed Test Recipients"
            value={
              diagnostics?.allowedTestRecipients.length
                ? diagnostics.allowedTestRecipients.map(formatBangladeshPhone).join(', ')
                : 'None configured'
            }
          />
          <Fact
            label="Automatic Production Sending"
            value={
              noProduction
                ? 'Unavailable'
                : diagnostics?.enabled
                  ? 'Available subject to policies'
                  : 'Disabled'
            }
          />
        </DiagnosticSection>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Provider Capability Matrix</CardTitle>
          <CardDescription>
            Rendered from adapter metadata. No future provider capabilities are fabricated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(capabilityLabels).map(([key, label]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <span>{label}</span>
                {capabilities.has(key) ? (
                  <Badge className="bg-emerald-100 text-emerald-800">
                    <CheckCircle2 aria-hidden="true" className="mr-1 size-3" />
                    Supported
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    <CircleDashed aria-hidden="true" className="mr-1 size-3" />
                    {diagnostics?.provider === 'none' ? 'Unavailable' : 'Not Declared'}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Provider Selection & Requirements</CardTitle>
          <CardDescription>
            Evaluation criteria for onboarding future Bangladesh SMS telecom gateway providers into
            Maevelle.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" />
              <strong className="text-sm">Mandatory Capabilities</strong>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
              <li>Transactional HTTPS REST API with JSON response format.</li>
              <li>Unique provider message ID returned upon request acceptance.</li>
              <li>Delivery callbacks (webhooks) or reliable status polling API.</li>
              <li>Full Unicode (UCS-2 / UTF-8) support for Bengali text.</li>
              <li>Masking sender support approved for brand identity MAEVELLE.</li>
            </ul>
          </div>
          <div className="rounded-lg border p-3.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
              <strong className="text-sm">Recommended & Operational</strong>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
              <li>Balance check API (BDT) for diagnostic monitoring.</li>
              <li>Actual billable segment count and per-message cost reporting.</li>
              <li>Clear error classification (transient retryable vs permanent).</li>
              <li>Webhook signing or header-token verification.</li>
              <li>Provider-side request deduplication / idempotency.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Production Activation Checklist</CardTitle>
          <CardDescription>
            Only checks backed by Maevelle or provider evidence can become ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {diagnostics?.readiness.map((item) => (
            <div key={item.key} className="flex gap-3 rounded-lg border p-3">
              {item.state === 'READY' ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-emerald-600"
                />
              ) : (
                <Clock3
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                />
              )}
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {item.explanation}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Implementation References</CardTitle>
          <CardDescription>
            Repository-native guides for business owners and provider integration.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            'docs/sms-notifications/README.md',
            'docs/sms-notifications/admin-guide.md',
            'docs/sms-notifications/developer-guide.md',
            'docs/sms-notifications/provider-integration-guide.md',
            'docs/sms-notifications/provider-selection-checklist.md',
            'docs/sms-notifications/environment.md',
          ].map((path) => (
            <div key={path} className="flex items-center gap-2 rounded-lg border p-3">
              <ExternalLink aria-hidden="true" className="size-4 text-muted-foreground" />
              <code className="break-all text-xs">{path}</code>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DiagnosticSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly icon: typeof Server;
  readonly children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon aria-hidden="true" className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}
function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value}</p>
    </div>
  );
}
