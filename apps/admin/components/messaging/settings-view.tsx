'use client';

import { Archive, Check, Clock3, Plus, Save, Settings2, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  AgentAvailabilityView,
  BusinessHoursView,
  MessagingTag,
  SavedReplyView,
} from '@maevelle/contracts/messaging';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import * as api from './api';
import { useMessaging } from './messaging-provider';
import type { AssignmentRuleView, ChannelSettingsView, NotificationPreferenceView } from './types';

type SettingsTab = 'channels' | 'hours' | 'routing' | 'content' | 'notifications';
const weekdays = [
  ['sun', 'Sunday'],
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
] as const;

export function SettingsView() {
  const messaging = useMessaging();
  const [tab, setTab] = useState<SettingsTab>('channels');
  const [channels, setChannels] = useState<readonly ChannelSettingsView[]>([]);
  const [hours, setHours] = useState<BusinessHoursView | null>(null);
  const [rules, setRules] = useState<readonly AssignmentRuleView[]>([]);
  const [tags, setTags] = useState<readonly MessagingTag[]>([]);
  const [replies, setReplies] = useState<readonly SavedReplyView[]>([]);
  const [agents, setAgents] = useState<readonly AgentAvailabilityView[]>([]);
  const [preferences, setPreferences] = useState<readonly NotificationPreferenceView[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  async function load() {
    setState('loading');
    try {
      const [
        nextChannels,
        nextHours,
        nextRules,
        nextTags,
        nextReplies,
        nextAgents,
        nextPreferences,
      ] = await Promise.all([
        api.listChannelSettings(),
        api.getBusinessHours(),
        api.listAssignmentRules(),
        api.listTags(true),
        messaging.capabilities.includes('messaging.saved_replies.use')
          ? api.listSavedReplies(undefined, true)
          : Promise.resolve([]),
        messaging.capabilities.includes('messaging.availability.view')
          ? api.listEligibleAgents()
          : Promise.resolve([]),
        api.listNotificationPreferences(),
      ]);
      setChannels(nextChannels.filter((channel) => channel.channelKind === 'WEBSITE'));
      setHours(nextHours);
      setRules(nextRules);
      setTags(nextTags);
      setReplies(nextReplies);
      setAgents(nextAgents);
      setPreferences(nextPreferences);
      setState('ready');
    } catch {
      setState('error');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
          {(['channels', 'hours', 'routing', 'content', 'notifications'] as const).map((value) => (
            <Button
              key={value}
              variant={tab === value ? 'secondary' : 'ghost'}
              size="sm"
              className="shrink-0 capitalize"
              onClick={() => setTab(value)}
            >
              {value}
            </Button>
          ))}
        </div>
        {state === 'loading' ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading settings…</p>
        ) : null}
        {state === 'error' ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">Settings could not be loaded.</p>
            <Button variant="outline" className="mt-3" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : null}
        {state === 'ready' && tab === 'channels' ? (
          <Channels channels={channels} onReload={load} />
        ) : null}
        {state === 'ready' && tab === 'hours' && hours ? (
          <BusinessHours value={hours} onChange={setHours} onReload={load} />
        ) : null}
        {state === 'ready' && tab === 'routing' ? (
          <Routing rules={rules} agents={agents} onReload={load} />
        ) : null}
        {state === 'ready' && tab === 'content' ? (
          <ContentLibrary
            tags={tags}
            replies={replies}
            canManageTags={messaging.capabilities.includes('messaging.tags.manage')}
            canManageReplies={messaging.capabilities.includes('messaging.saved_replies.manage')}
            onReload={load}
          />
        ) : null}
        {state === 'ready' && tab === 'notifications' ? (
          <Notifications preferences={preferences} onReload={load} />
        ) : null}
      </div>
    </div>
  );
}

function Channels({
  channels,
  onReload,
}: {
  channels: readonly ChannelSettingsView[];
  onReload: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState(channels);
  useEffect(() => setDrafts(channels), [channels]);
  if (!drafts.length)
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
        <h3 className="font-semibold">No website channel configured</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Create the organization’s website messaging connection before configuring greetings and
          offline behavior.
        </p>
      </div>
    );
  return (
    <div className="space-y-4">
      {drafts.map((channel, index) => (
        <section key={channel.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{channel.displayName}</h3>
              <p className="text-xs text-muted-foreground">
                {channel.channelKind.toLowerCase()} · {channel.status.toLowerCase()}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={channel.enabled}
                onChange={(event) =>
                  setDrafts((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, enabled: event.target.checked } : item,
                    ),
                  )
                }
              />{' '}
              Enabled
            </label>
          </div>
          <div className="mt-4 grid gap-3">
            <label className="space-y-1 text-sm font-medium">
              Greeting
              <Textarea
                value={channel.greeting}
                onChange={(event) =>
                  setDrafts((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, greeting: event.target.value } : item,
                    ),
                  )
                }
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Offline message
              <Textarea
                value={channel.offlineMessage}
                onChange={(event) =>
                  setDrafts((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, offlineMessage: event.target.value } : item,
                    ),
                  )
                }
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={channel.acceptsOfflineMessages}
                onChange={(event) =>
                  setDrafts((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, acceptsOfflineMessages: event.target.checked }
                        : item,
                    ),
                  )
                }
              />{' '}
              Accept messages outside business hours
            </label>
            <Button
              className="justify-self-end"
              onClick={async () => {
                await api.updateChannelSettings(channel);
                toast.add({ title: 'Channel settings saved', type: 'success' });
                await onReload();
              }}
            >
              <Save className="size-4" /> Save channel
            </Button>
          </div>
        </section>
      ))}
    </div>
  );
}

function BusinessHours({
  value,
  onChange,
  onReload,
}: {
  value: BusinessHoursView;
  onChange: (value: BusinessHoursView) => void;
  onReload: () => Promise<void>;
}) {
  function updateDay(day: string, part: 'enabled' | 'start' | 'end', input: boolean | string) {
    const current = value.weeklySchedule[day]?.[0] ?? { start: '09:00', end: '18:00' };
    const intervals =
      part === 'enabled' ? (input ? [current] : []) : [{ ...current, [part]: input }];
    onChange({ ...value, weeklySchedule: { ...value.weeklySchedule, [day]: intervals } });
  }
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Clock3 className="size-5 text-primary" />
        <div>
          <h3 className="font-semibold">Business hours</h3>
          <p className="text-xs text-muted-foreground">
            Timezone-aware customer availability and offline behavior.
          </p>
        </div>
      </div>
      <label className="mt-4 block space-y-1 text-sm font-medium">
        Timezone
        <Input
          value={value.timezone}
          onChange={(event) => onChange({ ...value, timezone: event.target.value })}
        />
      </label>
      <div className="mt-4 divide-y divide-border">
        {weekdays.map(([day, label]) => {
          const interval = value.weeklySchedule[day]?.[0];
          return (
            <div
              key={day}
              className="grid grid-cols-[7rem_1fr] items-center gap-3 py-3 sm:grid-cols-[8rem_1fr_1fr]"
            >
              <label className="flex items-center gap-2 text-sm capitalize">
                <input
                  type="checkbox"
                  checked={Boolean(interval)}
                  onChange={(event) => updateDay(day, 'enabled', event.target.checked)}
                />
                {label}
              </label>
              {interval ? (
                <>
                  <Input
                    type="time"
                    value={interval.start}
                    onChange={(event) => updateDay(day, 'start', event.target.value)}
                    aria-label={`${day} opening time`}
                  />
                  <Input
                    type="time"
                    value={interval.end}
                    onChange={(event) => updateDay(day, 'end', event.target.value)}
                    aria-label={`${day} closing time`}
                  />
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Closed</span>
              )}
            </div>
          );
        })}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.offlineAcceptsMessages}
          onChange={(event) => onChange({ ...value, offlineAcceptsMessages: event.target.checked })}
        />{' '}
        Accept messages while closed
      </label>
      <div className="mt-5 flex justify-end">
        <Button
          onClick={async () => {
            await api.updateBusinessHours(value);
            toast.add({ title: 'Business hours saved', type: 'success' });
            await onReload();
          }}
        >
          <Save className="size-4" /> Save hours
        </Button>
      </div>
    </section>
  );
}

function Routing({
  rules,
  agents,
  onReload,
}: {
  rules: readonly AssignmentRuleView[];
  agents: readonly AgentAvailabilityView[];
  onReload: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('WEBSITE');
  const [agentId, setAgentId] = useState('');
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <UsersRound className="size-5 text-primary" />
          <div>
            <h3 className="font-semibold">Assignment rules</h3>
            <p className="text-xs text-muted-foreground">
              Ordered rules route new conversations to a specific eligible agent.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm font-medium">
            Rule name
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Website support"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Channel
            <NativeSelect value={channel} onChange={(event) => setChannel(event.target.value)}>
              <NativeSelectOption value="WEBSITE">Website</NativeSelectOption>
            </NativeSelect>
          </label>
          <label className="space-y-1 text-sm font-medium">
            Assign to
            <NativeSelect value={agentId} onChange={(event) => setAgentId(event.target.value)}>
              <NativeSelectOption value="">Choose agent</NativeSelectOption>
              {agents.map((agent) => (
                <NativeSelectOption key={agent.membershipId} value={agent.membershipId}>
                  {agent.displayName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </div>
        <Button
          className="mt-3"
          disabled={!name.trim() || !agentId}
          onClick={async () => {
            await api.createAssignmentRule({
              name: name.trim(),
              position: rules.length,
              isEnabled: true,
              conditions: { channelKind: channel },
              actions: { assigneeMembershipId: agentId },
            });
            setName('');
            setAgentId('');
            await onReload();
          }}
        >
          <Plus className="size-4" /> Add rule
        </Button>
      </section>
      <div className="space-y-2">
        {rules.map((rule) => (
          <article
            key={rule.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
          >
            <div className="grid size-8 place-items-center rounded-lg bg-muted font-mono text-xs tabular-nums">
              {rule.position + 1}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{rule.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {String(rule.conditions.channelKind ?? 'Any channel')} →{' '}
                {agents.find((agent) => agent.membershipId === rule.actions.assigneeMembershipId)
                  ?.displayName ?? 'Configured action'}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={rule.isEnabled}
                onChange={async (event) => {
                  await api.updateAssignmentRule({ ...rule, isEnabled: event.target.checked });
                  await onReload();
                }}
              />{' '}
              Active
            </label>
          </article>
        ))}
      </div>
    </div>
  );
}

function ContentLibrary({
  tags,
  replies,
  canManageTags,
  canManageReplies,
  onReload,
}: {
  tags: readonly MessagingTag[];
  replies: readonly SavedReplyView[];
  canManageTags: boolean;
  canManageReplies: boolean;
  onReload: () => Promise<void>;
}) {
  const [tagLabel, setTagLabel] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [shortcut, setShortcut] = useState('');
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold">Conversation tags</h3>
        <div className="mt-3 flex gap-2">
          <Input
            value={tagLabel}
            onChange={(event) => setTagLabel(event.target.value)}
            placeholder="New tag label"
            disabled={!canManageTags}
          />
          <Button
            size="icon"
            aria-label="Create tag"
            disabled={!canManageTags || !tagLabel.trim()}
            onClick={async () => {
              await api.createTag(tagLabel.trim());
              setTagLabel('');
              await onReload();
            }}
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag.id}
              disabled={!canManageTags}
              onClick={async () => {
                await api.updateTag(tag.id, tag.version, {
                  status: tag.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
                });
                await onReload();
              }}
            >
              <Badge variant={tag.status === 'ACTIVE' ? 'secondary' : 'outline'}>
                {tag.label}
                {tag.status === 'ARCHIVED' ? ' · archived' : ''}
              </Badge>
            </button>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold">Saved replies</h3>
        <div className="mt-3 space-y-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Reply title"
            disabled={!canManageReplies}
          />
          <Input
            value={shortcut}
            onChange={(event) => setShortcut(event.target.value)}
            placeholder="Shortcut, e.g. /delivery"
            disabled={!canManageReplies}
          />
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Reusable response"
            disabled={!canManageReplies}
          />
          <Button
            disabled={!canManageReplies || !title.trim() || !body.trim()}
            onClick={async () => {
              await api.createSavedReply({
                title: title.trim(),
                body: body.trim(),
                ...(shortcut.trim() ? { shortcut: shortcut.trim() } : {}),
              });
              setTitle('');
              setBody('');
              setShortcut('');
              await onReload();
            }}
          >
            <Plus className="size-4" /> Add saved reply
          </Button>
        </div>
        <div className="mt-4 divide-y divide-border">
          {replies.map((reply) => (
            <article key={reply.id} className="py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{reply.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{reply.body}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    reply.status === 'ACTIVE' ? 'Archive saved reply' : 'Restore saved reply'
                  }
                  disabled={!canManageReplies}
                  onClick={async () => {
                    await api.updateSavedReply(reply.id, reply.version, {
                      status: reply.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
                    });
                    await onReload();
                  }}
                >
                  {reply.status === 'ACTIVE' ? (
                    <Archive className="size-4" />
                  ) : (
                    <Check className="size-4" />
                  )}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Notifications({
  preferences,
  onReload,
}: {
  preferences: readonly NotificationPreferenceView[];
  onReload: () => Promise<void>;
}) {
  const types = [
    {
      id: 'MESSAGING_ASSIGNMENT',
      label: 'Conversation assignments',
      description: 'Notify me when a conversation is assigned to me.',
    },
    {
      id: 'MESSAGING_FOLLOW_UP_DUE',
      label: 'Follow-ups due',
      description: 'Notify me when one of my follow-ups becomes due.',
    },
  ];
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Settings2 className="size-5 text-primary" />
        <div>
          <h3 className="font-semibold">My notifications</h3>
          <p className="text-xs text-muted-foreground">Personal in-app messaging alerts.</p>
        </div>
      </div>
      <div className="mt-4 divide-y divide-border">
        {types.map((item) => {
          const enabled =
            preferences.find((preference) => preference.notification_type === item.id)?.enabled ??
            true;
          return (
            <label key={item.id} className="flex items-center gap-4 py-4">
              <div className="flex-1">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <input
                type="checkbox"
                checked={enabled}
                onChange={async (event) => {
                  await api.updateNotificationPreference(item.id, event.target.checked);
                  await onReload();
                }}
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}
