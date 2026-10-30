/**
 * The owner's payments (OWNER-DECISIONS section 9; the backup reviewer never sees this, and the server refuses
 * them anyway). Payments waiting for a decision come first, oldest receipt first. Approve only after finding the
 * transfer in the real bank, Wise or PayPal statement: the receipt image alone is not enough. Every look at a
 * receipt and every decision is written to the audit trail.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { REFUND_CONSEQUENCES, REFUND_REASONS, type OwnerPaymentDetail, type OwnerPaymentItem, type ResidenceFlag } from '@fh/shared';
import { Confirm } from '@/components/confirm';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/form/fields';
import { Card, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { api, del, errorMessage, patch, post } from '@/lib/api';
import { formatMoney, formatWhen, waitedFor } from '@/lib/format';
import { useOwnerPayment, useOwnerPayments, useOwnerPlans, useOwnerProfilePlan } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { channelLabels, countryName, refundReasonLabels, termText, type PaymentStatus, type RefundReason } from '@/features/billing/labels';

/** As the owner sees them. */
const statusLabels: Record<PaymentStatus, string> = {
  awaiting_proof: 'No receipt yet',
  pending_review: 'To review',
  held: 'Held: waiting for the member',
  approved: 'Approved',
  rejected: 'Rejected',
  refunded: 'Refunded',
  cancelled: 'Cancelled by the member',
};

const filters: { value: string; label: string }[] = [
  { value: 'waiting', label: 'Needs a decision (to review or held)' },
  { value: 'pending_review', label: statusLabels.pending_review },
  { value: 'held', label: 'Held' },
  { value: 'awaiting_proof', label: statusLabels.awaiting_proof },
  { value: 'approved', label: statusLabels.approved },
  { value: 'rejected', label: statusLabels.rejected },
  { value: 'refunded', label: statusLabels.refunded },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All payments' },
];

const consequenceLabels: Record<(typeof REFUND_CONSEQUENCES)[number], string> = {
  end_plan: 'End the plan this payment bought, now',
  keep_plan: 'Keep the plan',
};

function flagText(flag: ResidenceFlag, item: OwnerPaymentItem): string {
  switch (flag) {
    case 'profile_country_differs':
      return `The profile says the candidate lives in ${countryName(item.profile.countryCode)}, but the payer declared ${countryName(item.residenceCountry)}.`;
    case 'phone_country_differs':
      return item.residenceCountry === 'LK'
        ? 'The payer declared Sri Lanka, but their phone number is not a Sri Lankan (+94) number.'
        : `The payer declared ${countryName(item.residenceCountry)}, but their phone number is Sri Lankan (+94).`;
    default:
      return 'No country of residence was declared.';
  }
}

const refresh = () => queryClient.invalidateQueries({ queryKey: ['owner'] });

export function PaymentsQueue() {
  const [status, setStatus] = useState('waiting');
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const list = useOwnerPayments(status, query);
  function search(event: FormEvent) {
    event.preventDefault();
    setQuery(typed.trim());
    setSelected(null);
  }
  return (
    <>
      <PageTitle kicker="Owner" title="Payments">
        Approve a payment only after you find the transfer in the real bank, Wise or PayPal statement. A receipt image
        alone is not enough.
      </PageTitle>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <SelectField
          label="Show"
          className="sm:w-72"
          value={status}
          placeholder="Choose…"
          onChange={(value) => {
            setStatus(value || 'waiting');
            setSelected(null);
          }}
          options={filters}
        />
        <form onSubmit={search} className="flex flex-1 items-end gap-2">
          <TextField label="Find by reference or statement line" className="flex-1" value={typed} onChange={setTyped} placeholder="FH7K3M9P" />
          <Button type="submit" variant="outline" className="h-[46px]">
            Find
          </Button>
        </form>
      </div>
      {query && (
        <p className="mb-4 text-sm">
          Showing payments matching <strong>{query}</strong>.{' '}
          <button type="button" className="text-brand underline underline-offset-4" onClick={() => { setQuery(''); setTyped(''); }}>
            Clear
          </button>
        </p>
      )}
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <Notice tone="error">{errorMessage(list.error)}</Notice>
      ) : list.data.length === 0 && !selected ? (
        <Notice>Nothing here.</Notice>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {/* A payment just decided leaves this list, but stays open beside it. */}
          {list.data.length === 0 ? (
            <Notice>Nothing else here.</Notice>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.data.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={item.id === selected}
                    onClick={() => setSelected(item.id)}
                    className="w-full rounded-[12px] border bg-card p-4 text-left text-sm hover:border-[var(--ui-accent)] aria-pressed:border-[var(--ui-purple)]"
                  >
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3 font-semibold">
                      <span className="font-mono">{item.reference}</span>
                      <span>{formatMoney(item.amountMinor, item.currency)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {item.profile.displayName ?? 'Deleted profile'} · {item.plan.name ?? item.plan.id}
                    </p>
                    <p className="text-muted-foreground">
                      {statusLabels[item.status]}
                      {(item.status === 'pending_review' || item.status === 'held') && item.proofSubmittedAt && ` · waiting ${waitedFor(item.proofSubmittedAt)}`}
                    </p>
                    {item.residenceFlags.length > 0 && (
                      <p className="mt-1 inline-flex rounded-full border border-[var(--ui-accent)] px-2 py-0.5 text-xs font-semibold">Check residence</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected ? <PaymentDetail key={selected} id={selected} /> : <Notice>Choose a payment to review.</Notice>}
        </div>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="inline font-semibold">{label}: </dt>
      <dd className="inline">{children}</dd>
    </div>
  );
}

function PaymentDetail({ id }: { id: string }) {
  const detail = useOwnerPayment(id);
  const [showPlan, setShowPlan] = useState(false);
  if (detail.isPending) return <Loading />;
  if (detail.isError) return <Notice tone="error">{errorMessage(detail.error)}</Notice>;
  const item = detail.data;
  const open = item.status === 'pending_review' || item.status === 'held';
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{statusLabels[item.status]}</p>
        <h2 className="mt-1 font-serif text-2xl">
          <span className="font-mono">{item.reference}</span> · {formatMoney(item.amountMinor, item.currency)}
        </h2>
        <dl className="mt-4 grid gap-2 text-sm">
          <Row label="Plan">
            {item.plan.name ?? item.plan.id} ({termText(item.plan.termMonths ?? 0)}, level {item.plan.level ?? '?'})
            {item.changeKind && item.changeKind !== 'new' && `: ${item.changeKind}${item.lostDays ? `, the member accepted losing ${item.lostDays} days` : ''}`}
          </Row>
          <Row label="Paid by">{channelLabels[item.channel]}</Row>
          <Row label="Payer">
            {item.payer.deleted ? 'Deleted account (payment kept for the retention period)' : item.payer.name || 'Unnamed account'}
            {item.payer.email && ` · ${item.payer.email}`}
            {item.payer.phone && ` · ${item.payer.phone}`}
          </Row>
          <Row label="Profile">
            {item.profile.displayName ?? 'Deleted profile'}
            {item.profile.countryCode && ` (lives in ${countryName(item.profile.countryCode)})`}
          </Row>
          <Row label="Declared residence">{countryName(item.residenceCountry)}</Row>
          <Row label="Started">{formatWhen(item.createdAt)}</Row>
          {item.proofSubmittedAt && <Row label="First receipt">{formatWhen(item.proofSubmittedAt)}</Row>}
          {item.settlementRef && <Row label="Statement line">{item.settlementRef}</Row>}
          {item.refundReason && <Row label="Refund reason">{refundReasonLabels[item.refundReason]}</Row>}
          {item.message && <Row label="Message to the member">{item.message}</Row>}
        </dl>
        {item.residenceFlags.length > 0 && (
          <div className="mt-4">
            <Notice tone="warning" title="Check the price band">
              <ul className="list-disc pl-5">
                {item.residenceFlags.map((flag) => (
                  <li key={flag}>{flagText(flag, item)}</li>
                ))}
              </ul>
              <p className="mt-2">
                This is for you to judge, not a reason to reject on its own: a Sri Lankan NIC does not show where someone
                lives. Compare it with the payment source.
              </p>
            </Notice>
          </div>
        )}
        {open && item.changeNow?.kind === 'blocked' && (
          <div className="mt-4">
            <Notice tone="error" title="This payment cannot be approved now">
              {item.changeNow.reason === 'downgrade'
                ? 'The profile now has a higher plan, so this would be a downgrade. Reject or refund it instead.'
                : 'The profile’s current plan is not in its last 7 days, so this renewal would be too early. Reject or refund it.'}
            </Notice>
          </div>
        )}
      </Card>

      <Receipts item={item} />
      <Decisions item={item} />
      <OwnerNote item={item} />

      <Card>
        <h3 className="font-serif text-xl">Profile plan</h3>
        {!item.profile.id ? (
          <p className="mt-2 text-sm text-muted-foreground">The profile was deleted.</p>
        ) : showPlan ? (
          <ProfilePlan profileId={item.profile.id} />
        ) : (
          <Button variant="outline" className="mt-3 h-11" onClick={() => setShowPlan(true)}>
            Show the plan history, grant or end a plan
          </Button>
        )}
      </Card>

      {item.history.length > 0 && (
        <Card>
          <h3 className="font-serif text-xl">History</h3>
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {item.history.map((entry, index) => (
              <li key={index}>
                {formatWhen(entry.createdAt)}: {entry.action.replace('payment.', '').replace('_', ' ')}
                {entry.reason && ` (${entry.reason})`}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Receipts({ item }: { item: OwnerPaymentDetail }) {
  const [shown, setShown] = useState<Record<string, string>>({});
  const show = useMutation({
    mutationFn: (proofId: string) => api<{ url: string }>(`/owner/payments/${item.id}/proofs/${proofId}`),
    onSuccess: (link, proofId) => setShown((current) => ({ ...current, [proofId]: link.url })),
  });
  return (
    <Card>
      <h3 className="font-serif text-xl">Receipts</h3>
      {item.proofs.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No receipt yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-4">
          {item.proofs.map((proof, index) => (
            <li key={proof.id} className="flex flex-col gap-2 text-sm">
              <p>
                Receipt {index + 1}, sent {formatWhen(proof.uploadedAt)}
              </p>
              {shown[proof.id] ? (
                <img src={shown[proof.id]} alt={`Receipt ${index + 1} for payment ${item.reference}`} className="w-full rounded-[10px] border" />
              ) : (
                <Button variant="outline" className="h-11 self-start" disabled={show.isPending} onClick={() => show.mutate(proof.id)}>
                  Show receipt {index + 1} (logged)
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {show.isError && (
        <div className="mt-3">
          <Notice tone="error">{errorMessage(show.error)}</Notice>
        </div>
      )}
    </Card>
  );
}

function Decisions({ item }: { item: OwnerPaymentDetail }) {
  const open = item.status === 'pending_review' || item.status === 'held';
  if (open) {
    return (
      <>
        <ApproveForm item={item} />
        <HoldOrReject item={item} />
        <RefundForm item={item} />
      </>
    );
  }
  if (item.status === 'approved') {
    return (
      <>
        <RefundForm item={item} />
        <SettlementCorrection item={item} />
      </>
    );
  }
  if (item.status === 'refunded') return <SettlementCorrection item={item} />;
  if (item.status === 'awaiting_proof' || item.status === 'cancelled') return <NoReceiptActions item={item} />;
  return null;
}

function ApproveForm({ item }: { item: OwnerPaymentDetail }) {
  const [settlement, setSettlement] = useState('');
  const [found, setFound] = useState(false);
  const approve = useMutation({
    mutationFn: () => post<{ status: string; endsAt: string }>(`/owner/payments/${item.id}/approve`, { settlementRef: settlement }),
    onSuccess: async (result) => {
      toast.success(result.status === 'already_approved' ? 'It was already approved; nothing changed.' : `Approved. The plan runs until ${formatWhen(result.endsAt)}.`);
      await refresh();
    },
  });
  const blocked = item.changeNow?.kind === 'blocked';
  return (
    <Card>
      <h3 className="font-serif text-xl">Approve</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          approve.mutate();
        }}
        className="mt-3 flex flex-col gap-4"
      >
        {approve.isError && <Notice tone="error">{errorMessage(approve.error)}</Notice>}
        <TextField
          label="Statement line or transaction ID"
          hint={`From the real statement, for ${formatMoney(item.amountMinor, item.currency)} with reference ${item.reference}. Each line can be used for one payment only.`}
          value={settlement}
          onChange={setSettlement}
          maxLength={100}
        />
        <CheckboxField
          checked={found}
          onChange={setFound}
          label="I found this transfer in the real bank, Wise or PayPal statement, with the right amount and reference."
        />
        {item.changeNow && item.changeNow.kind !== 'blocked' && (
          <p className="text-sm text-muted-foreground">
            {item.changeNow.kind === 'new'
              ? 'The plan starts now.'
              : `This ${item.changeNow.kind} replaces the current plan now${item.changeNow.lostDays ? `; ${item.changeNow.lostDays} days of it are lost` : ''}.`}
          </p>
        )}
        <Button type="submit" className="h-11 self-start" disabled={blocked || !found || settlement.trim().length < 3 || approve.isPending}>
          {approve.isPending ? 'Approving…' : 'Approve and start the plan'}
        </Button>
      </form>
    </Card>
  );
}

function HoldOrReject({ item }: { item: OwnerPaymentDetail }) {
  const [message, setMessage] = useState('');
  const hold = useMutation({
    mutationFn: () => post(`/owner/payments/${item.id}/hold`, { message }),
    onSuccess: async () => {
      toast.success('Held. The member sees your message and can send another receipt.');
      setMessage('');
      await refresh();
    },
  });
  const reject = useMutation({
    mutationFn: () => post(`/owner/payments/${item.id}/reject`, { reason: message }),
    onSuccess: async () => {
      toast.success('Rejected. The member sees your reason and can start a new payment.');
      setMessage('');
      await refresh();
    },
  });
  const error = hold.error ?? reject.error;
  const ready = message.trim().length >= 5;
  return (
    <Card>
      <h3 className="font-serif text-xl">Hold or reject</h3>
      <div className="mt-3 flex flex-col gap-4">
        {error && <Notice tone="error">{errorMessage(error)}</Notice>}
        <TextAreaField
          label="Message to the member"
          hint="Hold: what you need, for example a clearer receipt. Reject: why the payment cannot be accepted."
          rows={3}
          maxLength={500}
          value={message}
          onChange={setMessage}
        />
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="h-11" disabled={!ready || hold.isPending || reject.isPending} onClick={() => hold.mutate()}>
            Hold and ask for more
          </Button>
          <Confirm
            title="Reject this payment?"
            action="Reject payment"
            destructive
            onConfirm={() => reject.mutate()}
            trigger={
              <Button variant="destructive" className="h-11" disabled={!ready || hold.isPending || reject.isPending}>
                Reject
              </Button>
            }
          >
            <p>The payment closes and the member sees your reason. Any renewal grace it gave ends now.</p>
            <p>If you received the money and must return it, refund it instead.</p>
          </Confirm>
        </div>
      </div>
    </Card>
  );
}

function RefundForm({ item }: { item: OwnerPaymentDetail }) {
  const approved = item.status === 'approved';
  const [reason, setReason] = useState<RefundReason | ''>('');
  const [consequence, setConsequence] = useState<(typeof REFUND_CONSEQUENCES)[number] | ''>(approved ? '' : 'keep_plan');
  const [settlement, setSettlement] = useState('');
  const [message, setMessage] = useState('');
  const refund = useMutation({
    mutationFn: () =>
      post<{ planEnded: boolean }>(`/owner/payments/${item.id}/refund`, {
        reason,
        consequence,
        ...(approved ? {} : { settlementRef: settlement }),
        ...(message.trim() ? { message } : {}),
      }),
    onSuccess: async (result) => {
      toast.success(result.planEnded ? 'Refund recorded and the plan ended.' : 'Refund recorded.');
      await refresh();
    },
  });
  const ready = reason !== '' && consequence !== '' && (approved || settlement.trim().length >= 3);
  return (
    <Card>
      <h3 className="font-serif text-xl">Refund</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Only for a duplicate payment, a payment made by mistake, or a failure on our side (section 9). Send the money back
        yourself first; this records it.
      </p>
      <div className="mt-3 flex flex-col gap-4">
        {refund.isError && <Notice tone="error">{errorMessage(refund.error)}</Notice>}
        <SelectField
          label="Reason"
          value={reason}
          onChange={setReason}
          options={REFUND_REASONS.map((value) => ({ value, label: refundReasonLabels[value] }))}
        />
        {approved ? (
          <SelectField
            label="The plan this payment bought"
            value={consequence}
            onChange={setConsequence}
            options={REFUND_CONSEQUENCES.map((value) => ({ value, label: consequenceLabels[value] }))}
          />
        ) : (
          <TextField
            label="Statement line of the money received"
            hint="This payment was never approved, so record the transfer you are returning."
            value={settlement}
            onChange={setSettlement}
            maxLength={100}
          />
        )}
        <TextAreaField label="Message to the member (optional)" rows={2} maxLength={500} value={message} onChange={setMessage} />
        <Confirm
          title="Record this refund?"
          action="Record refund"
          destructive
          onConfirm={() => refund.mutate()}
          trigger={
            <Button variant="outline" className="h-11 self-start" disabled={!ready || refund.isPending}>
              Record refund
            </Button>
          }
        >
          <p>A refunded payment is closed and cannot be approved again.</p>
          {consequence === 'end_plan' && <p>The plan this payment bought ends now.</p>}
        </Confirm>
      </div>
    </Card>
  );
}

function SettlementCorrection({ item }: { item: OwnerPaymentDetail }) {
  const [settlement, setSettlement] = useState('');
  const [reason, setReason] = useState('');
  const correct = useMutation({
    mutationFn: () => post(`/owner/payments/${item.id}/settlement`, { settlementRef: settlement, reason }),
    onSuccess: async () => {
      toast.success('Statement line corrected. The old one is kept in the history.');
      setSettlement('');
      setReason('');
      await refresh();
    },
  });
  return (
    <Card>
      <h3 className="font-serif text-xl">Correct the statement line</h3>
      <div className="mt-3 flex flex-col gap-4">
        {correct.isError && <Notice tone="error">{errorMessage(correct.error)}</Notice>}
        <TextField label="Correct statement line" value={settlement} onChange={setSettlement} maxLength={100} />
        <TextField label="Why it changes" value={reason} onChange={setReason} maxLength={500} />
        <Button
          variant="outline"
          className="h-11 self-start"
          disabled={settlement.trim().length < 3 || reason.trim().length < 5 || correct.isPending}
          onClick={() => correct.mutate()}
        >
          Save correction
        </Button>
      </div>
    </Card>
  );
}

function NoReceiptActions({ item }: { item: OwnerPaymentDetail }) {
  const remove = useMutation({
    mutationFn: () => del(`/owner/payments/${item.id}`),
    onSuccess: async () => {
      toast.success('Payment deleted. The deletion is kept in the audit trail.');
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Card>
      <h3 className="font-serif text-xl">No receipt</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {item.status === 'cancelled' ? 'The member cancelled this payment before sending a receipt.' : 'The member has not sent a receipt yet.'}{' '}
        A payment without a receipt can be deleted; anything with a receipt or a decision stays on record.
      </p>
      <Confirm
        title="Delete this payment?"
        action="Delete payment"
        destructive
        onConfirm={() => remove.mutate()}
        trigger={
          <Button variant="outline" className="mt-4 h-11" disabled={remove.isPending}>
            Delete payment
          </Button>
        }
      >
        <p>Reference {item.reference} is removed. If money arrives with it later, you will not find it here.</p>
      </Confirm>
    </Card>
  );
}

function OwnerNote({ item }: { item: OwnerPaymentDetail }) {
  const [note, setNote] = useState(item.ownerNote ?? '');
  const save = useMutation({
    mutationFn: () => patch(`/owner/payments/${item.id}`, { ownerNote: note }),
    onSuccess: async () => {
      toast.success('Note saved.');
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Card>
      <h3 className="font-serif text-xl">Your note</h3>
      <div className="mt-3 flex flex-col gap-3">
        <TextAreaField label="Only you see this" rows={3} maxLength={1000} value={note} onChange={setNote} />
        <Button variant="outline" className="h-11 self-start" disabled={save.isPending || note === (item.ownerNote ?? '')} onClick={() => save.mutate()}>
          Save note
        </Button>
      </div>
    </Card>
  );
}

const eventLabels: Record<string, string> = {
  grant: 'Plan started',
  replace: 'Plan replaced',
  forfeit: 'Ended (engaged or married)',
  refund: 'Ended by refund',
  revoke: 'Ended by the owner',
};

/** Reasons the system records in words; the owner's own reasons are shown as written. */
const reasonLabels: Record<string, string> = {
  payment_approved: 'payment approved',
  engaged_or_married: 'marked engaged or married',
  ...Object.fromEntries(Object.entries(refundReasonLabels).map(([key, label]) => [key, `refund: ${label.toLowerCase()}`])),
};

function ProfilePlan({ profileId }: { profileId: string }) {
  const view = useOwnerProfilePlan(profileId);
  const plans = useOwnerPlans();
  const [planId, setPlanId] = useState('');
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const after = async (message: string) => {
    toast.success(message);
    setReason('');
    await refresh();
  };
  const grant = useMutation({
    mutationFn: () => post(`/owner/profiles/${profileId}/plan/grant`, { planId, reason, ...(days ? { days: Number(days) } : {}) }),
    onSuccess: () => after('Plan granted.'),
  });
  const revoke = useMutation({
    mutationFn: () => post(`/owner/profiles/${profileId}/plan/revoke`, { reason }),
    onSuccess: () => after('Plan ended.'),
  });
  if (view.isPending) return <Loading />;
  if (view.isError) return <Notice tone="error">{errorMessage(view.error)}</Notice>;
  const { current, entitlements } = view.data;
  const error = grant.error ?? revoke.error;
  const daysValue = days ? Number(days) : null;
  return (
    <div className="mt-3 flex flex-col gap-4 text-sm">
      <p>
        {current
          ? `${current.planName ?? 'A plan'} until ${formatWhen(current.endsAt)}${current.inGrace ? ' (renewal grace)' : ''}.`
          : 'No active plan.'}
      </p>
      {entitlements.length > 0 && (
        <ul className="flex flex-col gap-1">
          {entitlements.map((event) => (
            <li key={event.id}>
              {formatWhen(event.createdAt)}: {eventLabels[event.kind] ?? event.kind}
              {event.planId && ` · ${event.planId}`}
              {event.endsAt && ` · until ${formatWhen(event.endsAt)}`}
              {event.reason && ` · ${reasonLabels[event.reason] ?? event.reason}`}
            </li>
          ))}
        </ul>
      )}
      {error && <Notice tone="error">{errorMessage(error)}</Notice>}
      <TextField label="Reason (kept in the history)" value={reason} onChange={setReason} maxLength={500} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Grant a plan without payment"
          value={planId}
          onChange={setPlanId}
          options={(plans.data ?? []).map((plan) => ({ value: plan.id, label: `${plan.name}${plan.active ? '' : ' (retired)'}` }))}
        />
        <TextField
          label="Days (optional)"
          hint="Empty: the plan's own length."
          inputMode="numeric"
          value={days}
          onChange={(value) => setDays(value.replace(/\D/g, '').slice(0, 3))}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          className="h-11"
          disabled={!planId || reason.trim().length < 5 || (daysValue !== null && (daysValue < 1 || daysValue > 400)) || grant.isPending}
          onClick={() => grant.mutate()}
        >
          Grant plan
        </Button>
        {current && (
          <Confirm
            title="End this profile's plan now?"
            action="End plan"
            destructive
            onConfirm={() => revoke.mutate()}
            trigger={
              <Button variant="destructive" className="h-11" disabled={reason.trim().length < 5 || revoke.isPending}>
                End plan now
              </Button>
            }
          >
            <p>For example a disputed payment or a suspension. The remaining time is lost, and the member loses contact details at once.</p>
          </Confirm>
        )}
      </div>
    </div>
  );
}
