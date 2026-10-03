import { AlertTriangle, Languages, MessageSquareText } from 'lucide-react';
import type { SmsPreviewDto } from './sms-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type SmsMessageAnalysis = Pick<
  SmsPreviewDto,
  | 'encoding'
  | 'characterCount'
  | 'encodingUnitCount'
  | 'segmentCount'
  | 'perSegmentLimit'
  | 'segmentCapacity'
  | 'unitsRemainingInSegment'
  | 'warnings'
> & {
  readonly unicodeTriggerCharacters?: readonly string[];
};

export function SmsMessagePreview({
  text,
  analysis,
  sender = 'MAEVELLE',
  previewOnly = false,
}: {
  readonly text: string;
  readonly analysis: SmsMessageAnalysis;
  readonly sender?: string;
  readonly previewOnly?: boolean;
}) {
  const percentage = analysis.segmentCapacity
    ? Math.min(100, (analysis.encodingUnitCount / analysis.segmentCapacity) * 100)
    : 0;
  return (
    <div className="space-y-4">
      {previewOnly ? (
        <div className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-center text-xs font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-100">
          PREVIEW ONLY · NO SMS WILL BE SENT
        </div>
      ) : null}
      <div className="mx-auto w-full max-w-sm rounded-[2rem] border-8 border-slate-900 bg-slate-100 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between px-2 text-[11px] text-muted-foreground">
          <span translate="no">{sender}</span>
          <MessageSquareText aria-hidden="true" className="size-3.5" />
        </div>
        <div className="rounded-2xl rounded-tl-sm bg-background p-4 text-sm leading-relaxed shadow-xs whitespace-pre-wrap break-words">
          {text}
        </div>
        <p className="mt-2 px-2 text-right text-[10px] text-muted-foreground">
          Rendered by Maevelle
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <AnalysisFact
          label="Encoding"
          value={analysis.encoding === 'GSM_7' ? 'GSM-7' : 'Unicode'}
          icon={<Languages aria-hidden="true" className="size-4" />}
        />
        <AnalysisFact
          label="Characters"
          value={String(analysis.characterCount)}
          detail={`${analysis.encodingUnitCount} encoding units`}
        />
        <AnalysisFact
          label="Estimated Segments"
          value={String(analysis.segmentCount)}
          detail={
            analysis.segmentCount === 1
              ? '1 SMS segment'
              : `${analysis.segmentCount} billable segments estimated`
          }
        />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Segment Capacity</CardTitle>
          <CardDescription>
            {analysis.encoding === 'GSM_7'
              ? 'Standard SMS character set; extension characters use 2 units.'
              : 'Bangla and other non-GSM characters use the shorter Unicode limits.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
          </div>
          <div className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {analysis.encodingUnitCount} / {analysis.segmentCapacity} units in current estimate
            </span>
            <span className="tabular-nums">{analysis.unitsRemainingInSegment} remaining</span>
          </div>
        </CardContent>
      </Card>
      {analysis.unicodeTriggerCharacters?.length ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50/60 p-3 text-xs text-purple-900 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-200">
          <span className="font-medium">Unicode Trigger Character Diagnostic:</span>
          {analysis.unicodeTriggerCharacters.map((char, index) => (
            <span
              key={index}
              className="inline-flex items-center rounded border border-purple-300 bg-background px-1.5 py-0.5 font-mono text-xs font-semibold shadow-2xs dark:border-purple-700"
            >
              {char} (U+{char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')})
            </span>
          ))}
        </div>
      ) : null}
      {analysis.warnings.map((warning) => (
        <div
          key={warning}
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{warning}</span>
        </div>
      ))}
    </div>
  );
}

function AnalysisFact({
  label,
  value,
  detail,
  icon,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {detail ? <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
