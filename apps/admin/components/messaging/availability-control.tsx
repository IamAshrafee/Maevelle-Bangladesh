'use client';

import { ChevronDown, Circle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AgentAvailabilityView } from '@maevelle/contracts/messaging';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import * as api from './api';

const choices: readonly AgentAvailabilityView['status'][] = ['ONLINE', 'BUSY', 'AWAY', 'OFFLINE'];

export function AvailabilityControl() {
  const [availability, setAvailability] = useState<AgentAvailabilityView | null>(null);
  useEffect(() => {
    let active = true;
    void api
      .getOwnAvailability()
      .then((value) => {
        if (active) setAvailability(value);
      })
      .catch(() => undefined);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible')
        void api.heartbeatAvailability().catch(() => undefined);
    }, 60_000);
    return () => {
      active = false;
      clearInterval(heartbeat);
    };
  }, []);
  const status = availability?.status ?? 'OFFLINE';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Circle
          className={cn(
            'size-2.5 fill-current',
            status === 'ONLINE'
              ? 'text-success'
              : status === 'BUSY'
                ? 'text-destructive'
                : status === 'AWAY'
                  ? 'text-warning'
                  : 'text-muted-foreground',
          )}
        />
        {status.toLowerCase()}
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>My availability</DropdownMenuLabel>
        {choices.map((choice) => (
          <DropdownMenuItem
            key={choice}
            onClick={async () =>
              setAvailability(await api.setOwnAvailability(choice, availability?.capacity ?? 10))
            }
          >
            <Circle
              className={cn(
                'size-2.5 fill-current',
                choice === 'ONLINE'
                  ? 'text-success'
                  : choice === 'BUSY'
                    ? 'text-destructive'
                    : choice === 'AWAY'
                      ? 'text-warning'
                      : 'text-muted-foreground',
              )}
            />
            {choice.toLowerCase()}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
