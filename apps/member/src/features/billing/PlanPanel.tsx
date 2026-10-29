/**
 * The "Plan" tab (OWNER-DECISIONS sections 2, 3 and 9): the plan in force, what each plan would do now
 * (upgrade, renewal, or not yet), paying by manual transfer with a unique reference and the owner's own
 * account details, receipt images, and the payments made so far. The server decides every rule again.
 */
import { useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import {
  MAX_PAYMENT_PROOFS,
  RENEWAL_GRACE_DAYS,
  RENEWAL_WINDOW_DAYS,
  type BillingOverview,
  type PaymentView,
  type PlanOption,
  type PlanUsage,
  type ProfileView,
} from '@fh/shared';
import { Confirm } from '@/components/confirm';
import { CheckboxField, SelectField } from '@/components/form/fields';
import { Card, Loading, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage, post } from '@/lib/api';
import { formatDay, formatMoney, formatWhen } from '@/lib/format';
import { refreshBilling, useBilling, usePlan } from '@/lib/queries';
import { countries } from '@/features/profile/options';
import { channelLabels, channelPhrases, limitsText, paymentStatusLabels, refundReasonLabels, refundTerms, termText, type PaymentChannel } from './labels';

const OPEN = ['awaiting_proof', 'pending_review', 'held'];
const DAY = 86_400_000;

/** Section 3: a clear warning before the plan ends, with the date and what will be hidden. */
export function ExpiryNotice({ usage }: { usage: PlanUsage }) {
  if (!usage.active || !usage.endsAt) return null;
  if (usage.inGrace) {
    return (
      <Notice tone="warning" title={`Your plan ended on ${formatWhen(usage.endsAt)}`}>
        We are checking your renewal payment, so you keep access until {formatWhen(usage.graceEndsAt!)} (up to{' '}
        {RENEWAL_GRACE_DAYS} days). If we cannot confirm it, contact details and social handles are hidden until you renew.
      </Notice>
    );
  }
  if (new Date(usage.endsAt).getTime() - Date.now() > RENEWAL_WINDOW_DAYS * DAY) return null;
  return (
    <Notice tone="warning" title={`Your plan ends on ${formatWhen(usage.endsAt)}`}>
      After that you will no longer see the contact details or social handles of anyone, including your connections.
      Your connections stay, and their details come back when you renew. You can renew now, in the last{' '}
      {RENEWAL_WINDOW_DAYS} days of the plan.
    </Notice>
  );
}

/** The plan in force: its end, the expiry warning, and what is left of its request limits (section 2). */
export function PlanSummary({ usage }: { usage: PlanUsage }) {
  return (
    <div className="text-sm">
      <p>
        {usage.planName ?? 'Active plan'}, until {formatWhen(usage.endsAt!)}.
      </p>
      <div className="mt-3">
        <ExpiryNotice usage={usage} />
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {usage.daily && (
          <div>
            <dt className="text-xs font-semibold text-muted-foreground uppercase">Requests today</dt>
            <dd>
              {usage.daily.used} of {usage.daily.cap}
            </dd>
          </div>
        )}
        {usage.monthly && (
          <div>
            <dt className="text-xs font-semibold text-muted-foreground uppercase">This month of your plan</dt>
            <dd>
              {usage.monthly.used} of {usage.monthly.cap}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">A new day starts at midnight, Sri Lanka time.</p>
    </div>
  );
}

export function PlanPanel({ profile }: { profile: ProfileView }) {
  const billing = useBilling(profile.id);
  const usage = usePlan(profile.id);
  const [choosing, setChoosing] = useState<PlanOption | null>(null);
  if (billing.isPending) return <Loading />;
  if (billing.isError) return <Notice tone="error">{errorMessage(billing.error)}</Notice>;
  const overview = billing.data;
  const open = overview.openPayment;
  const past = overview.history.filter((payment) => payment.id !== open?.id);
  return (
    <div className="flex flex-col gap-6">
      {usage.data?.active && (
        <Card>
          <h2 className="font-serif text-2xl">Your plan</h2>
          <div className="mt-2">
            <PlanSummary usage={usage.data} />
          </div>
        </Card>
      )}
      {open && <OpenPayment payment={open} />}
      <section aria-labelledby="plans-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="plans-heading" className="font-serif text-2xl">
            Plans
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each profile has its own plan. Publishing and receiving requests stay free; a plan lets this profile send
            requests, see who is interested and accept. There is no automatic renewal.
          </p>
        </div>
        {overview.options.length === 0 ? (
          <Notice>No plans are on sale right now.</Notice>
        ) : (
          overview.options.map((option) => (
            <PlanChoice key={option.id} option={option} blockedByOpen={Boolean(open)} onChoose={() => setChoosing(option)} />
          ))
        )}
      </section>
      {past.length > 0 && <PaymentHistory payments={past} />}
      <CheckoutDialog option={choosing} overview={overview} profile={profile} onClose={() => setChoosing(null)} />
    </div>
  );
}

function changeText(option: PlanOption): string {
  const { change } = option;
  const lost = change.lostDays === 1 ? '1 unused day' : `${change.lostDays} unused days`;
  switch (change.kind) {
    case 'new':
      return 'Starts on the day we approve your payment.';
    case 'upgrade':
      return `An upgrade: it replaces your current plan on the day we approve the payment, and the ${lost} of your current plan are lost.`;
    case 'renewal':
      return change.lostDays > 0
        ? `A renewal: the new term starts on the day we approve it, and the ${lost} left on your current plan are lost.`
        : 'A renewal: the new term starts on the day we approve it.';
    default:
      if (change.reason === 'renewal_window' && change.renewalOpensAt) {
        return `You can renew from ${formatWhen(change.renewalOpensAt)}, in the last ${RENEWAL_WINDOW_DAYS} days of your plan.`;
      }
      if (change.reason === 'downgrade') return 'Not available while your current plan is active. You can choose it once that plan has ended.';
      return 'Not on sale.';
  }
}

function PlanChoice({ option, blockedByOpen, onChoose }: { option: PlanOption; blockedByOpen: boolean; onChoose: () => void }) {
  const blocked = option.change.kind === 'blocked';
  const action = option.change.kind === 'upgrade' ? 'Upgrade' : option.change.kind === 'renewal' ? 'Renew' : 'Choose';
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-serif text-xl">{option.name}</h3>
        <p className="text-sm font-semibold">{option.prices.map((price) => formatMoney(price.amountMinor, price.currency)).join(' · ')}</p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {termText(option.termMonths)} · {limitsText(option)}
      </p>
      {option.description && <p className="mt-2 text-sm">{option.description}</p>}
      <p className="mt-3 text-sm">{changeText(option)}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button className="h-11" disabled={blocked || blockedByOpen} onClick={onChoose}>
          {action}
        </Button>
        {blockedByOpen && !blocked && <p className="text-xs text-muted-foreground">Finish or cancel the payment in progress first.</p>}
      </div>
    </Card>
  );
}

function CheckoutDialog({
  option,
  overview,
  profile,
  onClose,
}: {
  option: PlanOption | null;
  overview: BillingOverview;
  profile: ProfileView;
  onClose: () => void;
}) {
  const [country, setCountry] = useState(overview.residenceCountry ?? profile.fields.countryCode ?? 'LK');
  const [channel, setChannel] = useState<PaymentChannel | ''>('');
  const [termsRead, setTermsRead] = useState(false);
  const [daysLost, setDaysLost] = useState(false);
  const start = useMutation({
    mutationFn: () =>
      post<PaymentView>(`/profiles/${profile.id}/payments`, {
        planId: option!.id,
        residenceCountry: country,
        channel,
        confirmRefundTerms: true,
        confirmLostDays: daysLost,
      }),
    onSuccess: async () => {
      await refreshBilling();
      toast.success('Your payment details are ready.');
      close();
    },
  });
  function close() {
    onClose();
    setChannel('');
    setTermsRead(false);
    setDaysLost(false);
    start.reset();
  }
  if (!option) return <Dialog open={false} />;

  const currency = country === 'LK' ? 'LKR' : 'USD';
  const price = option.prices.find((p) => p.currency === currency) ?? null;
  const methods = overview.channels.filter((c) => c.currency === currency);
  const lostDays = option.change.lostDays;
  const ready = Boolean(price && channel && termsRead && (lostDays === 0 || daysLost));
  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready) start.mutate();
  }
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {option.name}: {termText(option.termMonths)}
            </DialogTitle>
            <DialogDescription>{changeText(option)}</DialogDescription>
          </DialogHeader>
          {start.isError && <Notice tone="error">{errorMessage(start.error)}</Notice>}
          <SelectField
            label="Where do you live?"
            hint="Sri Lanka pays in LKR, anywhere else in USD. We compare this with how you pay."
            value={country}
            onChange={(value) => {
              setCountry(value || 'LK');
              setChannel('');
            }}
            options={countries.map((c) => ({ value: c.code, label: c.name }))}
          />
          {price ? (
            <p className="text-sm">
              Price: <strong>{formatMoney(price.amountMinor, price.currency)}</strong> for {termText(option.termMonths)}.
            </p>
          ) : (
            <Notice>This plan has no {currency} price yet.</Notice>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-semibold">How will you pay?</legend>
            {methods.map((method) => (
              <label
                key={method.channel}
                className="flex min-h-11 items-center gap-3 rounded-[10px] border px-3 text-sm has-[:checked]:border-[var(--ui-purple)] has-[:disabled]:opacity-60"
              >
                <input
                  type="radio"
                  name="channel"
                  value={method.channel}
                  checked={channel === method.channel}
                  disabled={!method.available}
                  onChange={() => setChannel(method.channel)}
                  className="size-4 accent-[var(--ui-purple)]"
                />
                <span>
                  {channelLabels[method.channel]}
                  {!method.available && <span className="text-muted-foreground"> (not set up yet)</span>}
                </span>
              </label>
            ))}
            {methods.every((method) => !method.available) && (
              <p className="text-xs text-muted-foreground">Payments in {currency} are not set up yet. Please try again later.</p>
            )}
          </fieldset>
          <div className="rounded-[12px] border bg-[var(--ui-soft)] p-4 text-sm">
            <p className="font-semibold">Refund terms</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {refundTerms.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <CheckboxField checked={termsRead} onChange={setTermsRead} label="I have read the refund terms." />
          {lostDays > 0 && (
            <CheckboxField
              checked={daysLost}
              onChange={setDaysLost}
              label={`I understand the ${lostDays === 1 ? '1 unused day' : `${lostDays} unused days`} of the current plan will be lost.`}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || start.isPending}>
              {start.isPending ? 'Preparing…' : 'Get payment details'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OpenPayment({ payment }: { payment: PaymentView }) {
  const cancel = useMutation({
    mutationFn: () => post<PaymentView>(`/payments/${payment.id}/cancel`),
    onSuccess: async () => {
      await refreshBilling();
      toast.success('Payment cancelled.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const amount = formatMoney(payment.amountMinor, payment.currency);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payment.reference);
      toast.success('Reference copied.');
    } catch {
      toast.error('Could not copy. Please write the reference down.');
    }
  };
  return (
    <Card className="border-[var(--ui-accent)]">
      <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Payment in progress</p>
      <h2 className="mt-1 font-serif text-2xl">
        {payment.planName ?? 'Plan'}: {amount}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{paymentStatusLabels[payment.status]}</p>

      {payment.status === 'held' && payment.message && (
        <div className="mt-4">
          <Notice tone="warning" title="We need something more">
            {payment.message}
          </Notice>
        </div>
      )}
      {payment.status === 'pending_review' && (
        <p className="mt-4 text-sm">
          We have your receipt{payment.proofSubmittedAt ? ` from ${formatWhen(payment.proofSubmittedAt)}` : ''}. We now look for the
          transfer in our statement, usually within 48 hours, and the plan starts when we approve it.
        </p>
      )}

      <ol className="mt-5 flex list-decimal flex-col gap-4 pl-5 text-sm">
        <li>
          <p>
            Send exactly <strong>{amount}</strong> by {channelPhrases[payment.channel]} to:
          </p>
          {payment.instructions ? (
            <pre className="mt-2 rounded-[10px] border bg-[var(--ui-soft)] p-3 font-sans text-sm whitespace-pre-wrap">{payment.instructions}</pre>
          ) : (
            <p className="mt-2 text-muted-foreground">These payment details are no longer available. Cancel this payment and choose another method.</p>
          )}
        </li>
        <li>
          <p>Put this reference on the transfer, so we can match it to this profile:</p>
          <p className="mt-2 flex flex-wrap items-center gap-3">
            <span className="rounded-[10px] border bg-card px-3 py-2 font-mono text-lg font-semibold tracking-wider">{payment.reference}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
              <Copy aria-hidden="true" />
              Copy
            </Button>
          </p>
        </li>
        <li>
          <p>
            Upload a photo or screenshot of the receipt.{' '}
            {payment.proofCount > 0 && `${payment.proofCount} sent so far; send another only if we ask, or if the first was unclear.`}
          </p>
          <ReceiptUpload payment={payment} />
        </li>
      </ol>

      {payment.status === 'awaiting_proof' && (
        <div className="mt-6 border-t pt-4">
          <Confirm
            title="Cancel this payment?"
            action="Cancel payment"
            destructive
            onConfirm={() => cancel.mutate()}
            trigger={
              <Button variant="ghost" className="h-11" disabled={cancel.isPending}>
                Cancel this payment
              </Button>
            }
          >
            <p>Only cancel if you have not sent the money. The reference {payment.reference} stays on record.</p>
            <p>If you already paid, upload the receipt instead.</p>
          </Confirm>
        </div>
      )}
    </Card>
  );
}

function ReceiptUpload({ payment }: { payment: PaymentView }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.set('file', file!);
      return post<PaymentView>(`/payments/${payment.id}/proof`, form);
    },
    onSuccess: async () => {
      await refreshBilling();
      setFile(null);
      if (input.current) input.current.value = '';
      toast.success('Receipt sent. We will check it soon.');
    },
  });
  if (payment.proofCount >= MAX_PAYMENT_PROOFS) {
    return <p className="mt-2 text-muted-foreground">You have sent {MAX_PAYMENT_PROOFS} receipts, the most a payment can have. Contact us if we need more.</p>;
  }
  function choose(chosen: File | null) {
    setProblem(null);
    upload.reset();
    if (chosen && !['image/jpeg', 'image/png', 'image/webp'].includes(chosen.type)) {
      setProblem('Please choose a photo or screenshot (JPEG, PNG or WebP). PDF is not accepted.');
      return setFile(null);
    }
    if (chosen && chosen.size > 5 * 1024 * 1024) {
      setProblem('The file must be 5 MB or smaller.');
      return setFile(null);
    }
    setFile(chosen);
  }
  return (
    <div className="mt-2 flex flex-col gap-3">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Receipt photo or screenshot"
        onChange={(event) => choose(event.target.files?.[0] ?? null)}
        className="text-sm file:mr-3 file:min-h-10 file:rounded-[10px] file:border file:bg-card file:px-3 file:text-sm file:font-semibold"
      />
      {(problem || upload.isError) && <Notice tone="error">{problem ?? errorMessage(upload.error)}</Notice>}
      <Button className="h-11 self-start" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
        {upload.isPending ? 'Sending…' : 'Send receipt'}
      </Button>
    </div>
  );
}

function PaymentHistory({ payments }: { payments: PaymentView[] }) {
  return (
    <section aria-labelledby="history-heading">
      <h2 id="history-heading" className="font-serif text-2xl">
        Your payments
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {payments.map((payment) => (
          <li key={payment.id} className="rounded-[12px] border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <p className="font-semibold">
                {payment.planName ?? 'Plan'} · {formatMoney(payment.amountMinor, payment.currency)}
              </p>
              <p className="text-muted-foreground">{formatDay(payment.createdAt)}</p>
            </div>
            <p className="mt-1 text-muted-foreground">
              Reference <span className="font-mono">{payment.reference}</span> · {paymentStatusLabels[payment.status]}
              {payment.refundReason && ` (${refundReasonLabels[payment.refundReason].toLowerCase()})`}
            </p>
            {payment.message && !OPEN.includes(payment.status) && <p className="mt-1">{payment.message}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
