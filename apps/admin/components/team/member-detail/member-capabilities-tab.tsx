'use client';

import { Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TeamPermissionsEditor, type PermissionsEditorValue } from '../team-permissions-editor';

export interface MemberCapabilitiesTabProps {
  readonly memberName: string;
  readonly permissions: PermissionsEditorValue;
  readonly onPermissionsChange: (value: PermissionsEditorValue) => void;
  readonly canEdit: boolean;
  readonly isDirty: boolean;
  readonly changeReason: string;
  readonly onChangeReasonChange: (reason: string) => void;
  readonly busy: boolean;
  readonly onSave: () => Promise<void>;
  readonly onReset: () => void;
}

/**
 * Granular capability and location scope management tab for a team member.
 */
export function MemberCapabilitiesTab({
  memberName,
  permissions,
  onPermissionsChange,
  canEdit,
  isDirty,
  changeReason,
  onChangeReasonChange,
  busy,
  onSave,
  onReset,
}: MemberCapabilitiesTabProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Access Capabilities &amp; Location Scopes
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure specific administrative capabilities and location scopes granted to {memberName}
          .
        </p>
      </div>

      <TeamPermissionsEditor
        value={permissions}
        onChange={onPermissionsChange}
        readOnly={!canEdit}
        showPresetSelector={canEdit}
        maxHeightClassName="max-h-none"
      />

      {canEdit ? (
        <div className="space-y-4 pt-4 border-t border-border/60">
          <div className="space-y-1.5 max-w-xl">
            <Label htmlFor="change-reason" className="text-xs font-medium">
              Audit Reason for Modification
            </Label>
            <Input
              id="change-reason"
              placeholder="e.g. Promoted to Inventory Supervisor, assigned warehouse scope"
              value={changeReason}
              onChange={(e) => onChangeReasonChange(e.target.value)}
              className="text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              This explanation will be permanently recorded in the organizational access audit
              trail.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => void onSave()}
              disabled={busy || !isDirty}
              className="text-xs"
            >
              <Save className="size-3.5 mr-1.5" aria-hidden="true" />
              {busy ? 'Saving changes…' : 'Save capabilities'}
            </Button>

            {isDirty ? (
              <Button
                type="button"
                variant="outline"
                onClick={onReset}
                disabled={busy}
                className="text-xs"
              >
                Reset changes
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
