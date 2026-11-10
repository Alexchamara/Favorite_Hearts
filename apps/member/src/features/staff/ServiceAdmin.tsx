/**
 * The owner's service switches (OWNER-DECISIONS section 10): pause new sign-ups or document submissions while the review
 * queue is overwhelmed, and require a selfie holding the document with new submissions (owner, 5 Nov 2026). Members
 * already signed up keep using everything else, and the sign-in and verification screens say what is on. Every change
 * is audited with its reason.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { OperationsFlagView } from '@fh/shared';
import { TextField } from '@/components/form/fields';
import { Card, Loading, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { errorMessage, put } from '@/lib/api';
import { formatWhen } from '@/lib/format';
import { keys, useOwnerOperations } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';

type Wording = { title: string; on: string; off: string; effect: string; stateOn: string; stateOff: string; turnOn: string; turnOff: string };

const wording: Record<OperationsFlagView['key'], Wording> = {
  signups_paused: {
    title: 'New sign-ups',
    on: 'Paused: nobody new can create an account.',
    off: 'Open: anyone can create an account.',
    effect: 'Members who already have an account still sign in and use everything.',
    stateOn: 'Paused',
    stateOff: 'Open',
    turnOn: 'Pause new sign-ups',
    turnOff: 'Open new sign-ups again',
  },
  document_submissions_paused: {
    title: 'Identity document submissions',
    on: 'Paused: members cannot send a new document for review.',
    off: 'Open: members can send documents for review.',
    effect: 'Documents already sent stay in your queue. Nothing a member has done is lost.',
    stateOn: 'Paused',
    stateOff: 'Open',
    turnOn: 'Pause identity document submissions',
    turnOff: 'Open identity document submissions again',
  },
  selfie_required: {
    title: 'Selfie with the document',
    on: 'Required: a new submission must include a selfie of the member holding their document.',
    off: 'Not required: members send only the document photos.',
    effect: 'Applies to new submissions only; documents already sent keep the photos they had. Selfies are deleted with the document, 90 days after the review.',
    stateOn: 'Required',
    stateOff: 'Not required',
    turnOn: 'Require a selfie',
    turnOff: 'Stop requiring a selfie',
  },
};

export function ServiceAdmin() {
  const flags = useOwnerOperations();
  return (
    <div className="m-surface m-staff-area">
      <h3>Service</h3>
      <p>Pause new sign-ups or document submissions while the review queue catches up, and choose whether a document needs a selfie.</p>
      {flags.isPending ? (
        <Loading />
      ) : flags.isError ? (
        <Notice tone="error">{errorMessage(flags.error)}</Notice>
      ) : (
        <div className="flex flex-col gap-4">
          {flags.data.map((flag) => (
            <FlagCard key={flag.key} flag={flag} />
          ))}
        </div>
      )}
    </div>
  );
}

function FlagCard({ flag }: { flag: OperationsFlagView }) {
  const [reason, setReason] = useState('');
  const words = wording[flag.key];
  const save = useMutation({
    mutationFn: (enabled: boolean) => put<OperationsFlagView>(`/owner/operations/${flag.key}`, { enabled, reason: reason.trim() || undefined }),
    onSuccess: async (saved) => {
      toast.success(`${words.title}: ${(saved.enabled ? words.stateOn : words.stateOff).toLowerCase()}.`);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: keys.ownerOperations });
      await queryClient.invalidateQueries({ queryKey: keys.serviceStatus });
    },
  });
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="font-serif text-xl">{words.title}</h2>
        <p className={flag.enabled ? 'text-sm font-semibold text-destructive' : 'text-sm font-semibold'}>{flag.enabled ? words.stateOn : words.stateOff}</p>
      </div>
      <p className="mt-2 text-sm">{flag.enabled ? words.on : words.off}</p>
      <p className="mt-1 text-sm text-muted-foreground">{words.effect}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {/* A switch the owner never set comes back with the time 0 (routes/owner.ts). */}
        {new Date(flag.updatedAt).getTime() === 0 ? 'Never changed' : `Last changed ${formatWhen(flag.updatedAt)}`}
        {flag.reason ? ` · Reason: ${flag.reason}` : ''}
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {save.isError && <Notice tone="error">{errorMessage(save.error)}</Notice>}
        <TextField label="Reason (optional, kept in the audit trail)" maxLength={300} value={reason} onChange={setReason} />
        <Button
          variant={flag.enabled ? 'default' : 'outline'}
          className="h-11 self-start"
          disabled={save.isPending}
          onClick={() => save.mutate(!flag.enabled)}
        >
          {save.isPending ? 'Saving…' : flag.enabled ? words.turnOff : words.turnOn}
        </Button>
      </div>
    </Card>
  );
}
