/**
 * The owner's service switches (OWNER-DECISIONS section 10): pause new sign-ups or document submissions while the review
 * queue is overwhelmed. Members already signed up keep using everything else, and the sign-in and verification screens
 * say that the pause is on. Every change is audited with its reason.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { OperationsFlagView } from '@fh/shared';
import { TextField } from '@/components/form/fields';
import { Card, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { errorMessage, put } from '@/lib/api';
import { formatWhen } from '@/lib/format';
import { keys, useOwnerOperations } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';

const wording: Record<OperationsFlagView['key'], { title: string; on: string; off: string; effect: string }> = {
  signups_paused: {
    title: 'New sign-ups',
    on: 'Paused: nobody new can create an account.',
    off: 'Open: anyone can create an account.',
    effect: 'Members who already have an account still sign in and use everything.',
  },
  document_submissions_paused: {
    title: 'Identity document submissions',
    on: 'Paused: members cannot send a new document for review.',
    off: 'Open: members can send documents for review.',
    effect: 'Documents already sent stay in your queue. Nothing a member has done is lost.',
  },
};

export function ServiceAdmin() {
  const flags = useOwnerOperations();
  return (
    <>
      <PageTitle kicker="Owner" title="Service">
        Pause new sign-ups or document submissions while the review queue catches up, and open them again here.
      </PageTitle>
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
    </>
  );
}

function FlagCard({ flag }: { flag: OperationsFlagView }) {
  const [reason, setReason] = useState('');
  const words = wording[flag.key];
  const save = useMutation({
    mutationFn: (enabled: boolean) => put<OperationsFlagView>(`/owner/operations/${flag.key}`, { enabled, reason: reason.trim() || undefined }),
    onSuccess: async (saved) => {
      toast.success(`${words.title}: ${saved.enabled ? 'paused' : 'open again'}.`);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: keys.ownerOperations });
      await queryClient.invalidateQueries({ queryKey: keys.serviceStatus });
    },
  });
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="font-serif text-xl">{words.title}</h2>
        <p className={flag.enabled ? 'text-sm font-semibold text-destructive' : 'text-sm font-semibold'}>{flag.enabled ? 'Paused' : 'Open'}</p>
      </div>
      <p className="mt-2 text-sm">{flag.enabled ? words.on : words.off}</p>
      <p className="mt-1 text-sm text-muted-foreground">{words.effect}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Last changed {formatWhen(flag.updatedAt)}
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
          {save.isPending ? 'Saving…' : flag.enabled ? `Open ${words.title.toLowerCase()} again` : `Pause ${words.title.toLowerCase()}`}
        </Button>
      </div>
    </Card>
  );
}
