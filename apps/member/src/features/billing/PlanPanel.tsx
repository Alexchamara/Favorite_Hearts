/**
 * The "Plan" tab (OWNER-DECISIONS sections 2, 3 and 9): the plan in force, what each plan would do now
 * (upgrade, renewal, or not yet), paying by manual transfer with a unique reference and the owner's own
 * account details, receipt images, and the payments made so far. The server decides every rule again.
 * Plan names and the owner's payment instructions are the owner's own words and are shown as written.
 */
import { useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Check, Clock, Copy, Crown, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  MAX_PAYMENT_PROOFS,
  RENEWAL_WINDOW_DAYS,
  type BillingOverview,
  type PaymentView,
  type PlanOption,
  type PlanUsage,
  type ProfileView,
} from '@fh/shared';
import { Confirm } from '@/components/confirm';
import { CheckboxField, SelectField } from '@/components/form/fields';
import { Loading, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { errorMessage, post } from '@/lib/api';
import { formatDay, formatMoney, formatWhen } from '@/lib/format';
import { say, useI18n, type Translate } from '@/lib/i18n';
import { refreshBilling, useBilling, usePlan } from '@/lib/queries';
import { useCountries } from '@/features/profile/options';
import { useBillingLabels, type PaymentChannel } from './labels';

const OPEN = ['awaiting_proof', 'pending_review', 'held'];
const DAY = 86_400_000;

/** Section 3: a clear warning before the plan ends, with the date and what will be hidden. */
export function ExpiryNotice({ usage }: { usage: PlanUsage }) {
  const { t } = useI18n();
  if (!usage.active || !usage.endsAt) return null;
  if (usage.inGrace) {
    return (
      <Notice tone="warning" title={t('plan.grace.title', { date: formatWhen(usage.endsAt) })}>
        {t('plan.grace.body', { date: formatWhen(usage.graceEndsAt!) })}
      </Notice>
    );
  }
  if (new Date(usage.endsAt).getTime() - Date.now() > RENEWAL_WINDOW_DAYS * DAY) return null;
  return (
    <Notice tone="warning" title={t('plan.ending.title', { date: formatWhen(usage.endsAt) })}>
      {t('plan.ending.body')}
    </Notice>
  );
}

/** The plan in force: its end, the expiry warning, and what is left of its request limits (section 2). */
export function PlanSummary({ usage }: { usage: PlanUsage }) {
  const { t } = useI18n();
  return (
    <div className="text-sm">
      <p>{t('plan.until', { plan: usage.planName ?? t('plan.active'), date: formatWhen(usage.endsAt!) })}</p>
      <div className="mt-3">
        <ExpiryNotice usage={usage} />
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {usage.daily && (
          <div>
            <dt className="text-xs font-semibold text-muted-foreground uppercase">{t('plan.today')}</dt>
            <dd>{t('plan.usage', { used: usage.daily.used, cap: usage.daily.cap })}</dd>
          </div>
        )}
        {usage.monthly && (
          <div>
            <dt className="text-xs font-semibold text-muted-foreground uppercase">{t('plan.thisMonth')}</dt>
            <dd>{t('plan.usage', { used: usage.monthly.used, cap: usage.monthly.cap })}</dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">{t('plan.midnight')}</p>
    </div>
  );
}

/**
 * The demo's Membership page (SCREEN-046): heading (with the plan in force), the demo's note, a banner while a receipt
 * waits for review, the open payment's steps, the plan cards (.m-plans of .m-plan, the middle one featured), and the
 * payment history table. The rules are the server's (sections 2, 3, 9).
 */
export function PlanPanel({ profile }: { profile: ProfileView }) {
  const billing = useBilling(profile.id);
  const usage = usePlan(profile.id);
  const [choosing, setChoosing] = useState<PlanOption | null>(null);
  const { t } = useI18n();
  if (billing.isPending) return <Loading />;
  if (billing.isError) return <Notice tone="error">{errorMessage(billing.error)}</Notice>;
  const overview = billing.data;
  const open = overview.openPayment;
  const past = overview.history.filter((payment) => payment.id !== open?.id);
  const active = Boolean(usage.data?.active);
  const currency = (overview.residenceCountry ?? profile.fields.countryCode ?? 'LK') === 'LK' ? 'LKR' : 'USD';
  return (
    <>
      <div className="m-page-heading">
        <div>
          <span className="m-kicker uppercase">{t('membership.kicker')}</span>
          <h1>{t(active ? 'membership.titleActive' : 'membership.title')}</h1>
          <p>{t(active ? 'membership.leadActive' : 'membership.lead')}</p>
        </div>
        {active && usage.data?.endsAt && (
          <span className="m-tag">
            <Crown size={14} aria-hidden="true" />
            {t('plan.until', { plan: usage.data.planName ?? t('plan.active'), date: formatWhen(usage.data.endsAt) })}
          </span>
        )}
      </div>
      <div className="m-note">
        <FileText size={20} aria-hidden="true" />
        <span>{t('membership.note')}</span>
      </div>
      {open?.status === 'pending_review' && (
        <div className="m-banner">
          <Clock size={21} aria-hidden="true" />
          <span>
            <strong>{t('membership.pending.title')}</strong> {t('membership.pending.body')}
          </span>
          <button type="button" onClick={() => document.getElementById('open-payment')?.scrollIntoView({ behavior: 'smooth' })}>
            {t('membership.pending.view')}
          </button>
        </div>
      )}
      {active && usage.data && (
        <section className="m-surface" aria-labelledby="plan-yours">
          <h3 id="plan-yours">{t('plan.yours')}</h3>
          <PlanSummary usage={usage.data} />
        </section>
      )}
      {open && <OpenPayment payment={open} />}
      <section aria-labelledby="plans-heading">
        <h2 id="plans-heading" className="sr-only">
          {t('plan.plans')}
        </h2>
        {overview.options.length === 0 ? (
          <Notice>{t('plan.none')}</Notice>
        ) : (
          <div className="m-plans">
            {overview.options.map((option, index) => (
              <PlanChoice key={option.id} option={option} index={index} currency={currency} blockedByOpen={Boolean(open)} onChoose={() => setChoosing(option)} />
            ))}
          </div>
        )}
        <p className="m-small-print">{t('plan.plans.intro')}</p>
      </section>
      <PaymentHistory payments={past} />
      <CheckoutDialog option={choosing} overview={overview} profile={profile} onClose={() => setChoosing(null)} />
    </>
  );
}

function changeText(t: Translate, option: PlanOption): string {
  const { change } = option;
  const lost = t('change.lostDays', { count: change.lostDays });
  switch (change.kind) {
    case 'new':
      return t('change.new');
    case 'upgrade':
      return t('change.upgrade', { lost });
    case 'renewal':
      return change.lostDays > 0 ? t('change.renewalLost', { lost }) : t('change.renewal');
    default:
      if (change.reason === 'renewal_window' && change.renewalOpensAt) {
        return t('change.renewFrom', { date: formatWhen(change.renewalOpensAt) });
      }
      if (change.reason === 'downgrade') return t('change.downgrade');
      return t('change.notOnSale');
  }
}

/** The demo's plan card: tier kicker, name, what it is, the price, the term, the action, and what it unlocks. */
function PlanChoice({ option, index, currency, blockedByOpen, onChoose }: { option: PlanOption; index: number; currency: string; blockedByOpen: boolean; onChoose: () => void }) {
  const { t } = useI18n();
  const { limitsText, termText } = useBillingLabels();
  const blocked = option.change.kind === 'blocked';
  const featured = index === 1;
  const price = option.prices.find((p) => p.currency === currency) ?? option.prices[0];
  const action = t(option.change.kind === 'upgrade' ? 'plan.action.upgrade' : option.change.kind === 'renewal' ? 'plan.action.renew' : 'plan.action.choose');
  const tier = index === 0 ? 'membership.tier.1' : index === 1 ? 'membership.tier.2' : 'membership.tier.3';
  return (
    // Decision B6: the demo's three card styles (keyed in its CSS by data-plan) follow the plans by level, not by name.
    <article
      data-plan={(['essential', 'matrimony', 'ownership-transfer'] as const)[Math.min(index, 2)]}
      data-plan-id={option.id}
      className={`m-plan ${featured ? 'featured' : ''}`}
      aria-labelledby={`plan-${option.id}`}
    >
      {featured && <div className="m-plan-ribbon uppercase">{t('membership.ribbon')}</div>}
      <span className="m-kicker uppercase">{t(tier)}</span>
      <h2 id={`plan-${option.id}`}>{option.name}</h2>
      <p>{option.description ?? changeText(t, option)}</p>
      {price && (
        <div className="m-price">
          <small>{price.currency}</small>
          {formatMoney(price.amountMinor, price.currency).replace(price.currency, '').trim()}
        </div>
      )}
      <small>{t('membership.afterApproval', { term: termText(option.termMonths) })}</small>
      <button type="button" className={`m-btn ${featured ? '' : 'm-secondary'} m-full`} disabled={blocked || blockedByOpen} onClick={onChoose}>
        {action}
        <ArrowRight size={15} aria-hidden="true" />
      </button>
      {blockedByOpen && !blocked && <small>{t('plan.finishOpen')}</small>}
      <ul>
        {[limitsText(option), t('membership.feature.interested'), t('membership.feature.accept'), t('membership.feature.contact')].map((feature) => (
          <li key={feature}>
            <Check size={16} aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>
    </article>
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
  const { t, rich } = useI18n();
  const { channelLabels, refundTerms, termText } = useBillingLabels();
  const countries = useCountries();
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
      toast.success(say('checkout.ready'));
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
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <span className="m-kicker uppercase">{t('checkout.kicker')}</span>
            <DialogTitle>{t('checkout.closer')}</DialogTitle>
            <DialogDescription>
              {t('checkout.title', { plan: option.name, term: termText(option.termMonths) })} {changeText(t, option)}
            </DialogDescription>
          </DialogHeader>
          {/* The demo's three steps: transfer, upload the receipt, our review. */}
          <div className="m-payment-steps">
            {(['1', '2', '3'] as const).map((n) => (
              <span key={n}>
                <b>{n}</b>
                {t(`checkout.step.${n}`)}
              </span>
            ))}
          </div>
          {start.isError && <Notice tone="error">{errorMessage(start.error)}</Notice>}
          <SelectField
            label={t('checkout.country')}
            hint={t('checkout.country.hint')}
            value={country}
            onChange={(value) => {
              setCountry(value || 'LK');
              setChannel('');
            }}
            options={countries.map((c) => ({ value: c.code, label: c.name }))}
          />
          {price ? (
            <p className="text-sm">
              {rich(
                'checkout.price',
                { strong: (words) => <strong>{words}</strong> },
                { price: formatMoney(price.amountMinor, price.currency), term: termText(option.termMonths) },
              )}
            </p>
          ) : (
            <Notice>{t('checkout.noPrice', { currency })}</Notice>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-semibold">{t('checkout.how')}</legend>
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
                  {!method.available && <span className="text-muted-foreground"> {t('checkout.notSetUp')}</span>}
                </span>
              </label>
            ))}
            {methods.every((method) => !method.available) && (
              <p className="text-xs text-muted-foreground">{t('checkout.noneSetUp', { currency })}</p>
            )}
          </fieldset>
          <div className="rounded-[12px] border bg-[var(--ui-soft)] p-4 text-sm">
            <p className="font-semibold">{t('checkout.refundTerms')}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {refundTerms.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <CheckboxField checked={termsRead} onChange={setTermsRead} label={t('checkout.termsRead')} />
          {lostDays > 0 && (
            <CheckboxField
              checked={daysLost}
              onChange={setDaysLost}
              label={t('checkout.lostDays', { lost: t('change.lostDays', { count: lostDays }) })}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!ready || start.isPending}>
              {start.isPending ? t('checkout.preparing') : t('checkout.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OpenPayment({ payment }: { payment: PaymentView }) {
  const { t, rich } = useI18n();
  const { channelPhrases, paymentStatusLabels } = useBillingLabels();
  const cancel = useMutation({
    mutationFn: () => post<PaymentView>(`/payments/${payment.id}/cancel`),
    onSuccess: async () => {
      await refreshBilling();
      toast.success(say('open.cancelled'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const amount = formatMoney(payment.amountMinor, payment.currency);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payment.reference);
      toast.success(say('open.copied'));
    } catch {
      toast.error(say('open.copyFailed'));
    }
  };
  return (
    <section className="m-surface" id="open-payment" aria-labelledby="open-payment-title">
      <span className="m-kicker uppercase">{t('open.kicker')}</span>
      <h2 id="open-payment-title">{t('open.title', { plan: payment.planName ?? t('open.plan'), amount })}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{paymentStatusLabels[payment.status]}</p>

      {payment.status === 'held' && payment.message && (
        <div className="mt-4">
          <Notice tone="warning" title={t('open.held')}>
            {payment.message}
          </Notice>
        </div>
      )}
      {payment.status === 'pending_review' && (
        <p className="mt-4 text-sm">
          {payment.proofSubmittedAt ? t('open.pendingFrom', { date: formatWhen(payment.proofSubmittedAt) }) : t('open.pending')}
        </p>
      )}

      <ol className="mt-5 flex list-decimal flex-col gap-4 pl-5 text-sm">
        <li>
          <p>{rich('open.send', { strong: (words) => <strong>{words}</strong> }, { amount, channel: channelPhrases[payment.channel] })}</p>
          {payment.instructions ? (
            // The owner's own payment instructions, shown as written, in the demo's bank-details box.
            <div className="m-bank-details mt-2">
              <pre className="font-sans text-sm whitespace-pre-wrap">{payment.instructions}</pre>
            </div>
          ) : (
            <p className="mt-2 text-muted-foreground">{t('open.detailsGone')}</p>
          )}
        </li>
        <li>
          <p>{t('open.reference')}</p>
          <p className="mt-2 flex flex-wrap items-center gap-3">
            <span className="rounded-[10px] border bg-card px-3 py-2 font-mono text-lg font-semibold tracking-wider">{payment.reference}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
              <Copy aria-hidden="true" />
              {t('open.copy')}
            </Button>
          </p>
        </li>
        <li>
          <p>
            {t('open.upload')} {payment.proofCount > 0 && t('open.sentSoFar', { count: payment.proofCount })}
          </p>
          <ReceiptUpload payment={payment} />
        </li>
      </ol>

      {payment.status === 'awaiting_proof' && (
        <div className="mt-6 border-t pt-4">
          <Confirm
            title={t('open.cancel.title')}
            action={t('open.cancel.action')}
            destructive
            onConfirm={() => cancel.mutate()}
            trigger={
              <Button variant="ghost" className="h-11" disabled={cancel.isPending}>
                {t('open.cancel.button')}
              </Button>
            }
          >
            <p>{t('open.cancel.notPaid', { reference: payment.reference })}</p>
            <p>{t('open.cancel.paid')}</p>
          </Confirm>
        </div>
      )}
    </section>
  );
}

function ReceiptUpload({ payment }: { payment: PaymentView }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { t } = useI18n();
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
      toast.success(say('receipt.sent'));
    },
  });
  if (payment.proofCount >= MAX_PAYMENT_PROOFS) {
    return <p className="mt-2 text-muted-foreground">{t('receipt.max')}</p>;
  }
  function choose(chosen: File | null) {
    setProblem(null);
    upload.reset();
    if (chosen && !['image/jpeg', 'image/png', 'image/webp'].includes(chosen.type)) {
      setProblem(t('receipt.wrongType'));
      return setFile(null);
    }
    if (chosen && chosen.size > 5 * 1024 * 1024) {
      setProblem(t('receipt.tooLarge'));
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
        aria-label={t('receipt.label')}
        onChange={(event) => choose(event.target.files?.[0] ?? null)}
        className="text-sm file:mr-3 file:min-h-10 file:rounded-[10px] file:border file:bg-card file:px-3 file:text-sm file:font-semibold"
      />
      {(problem || upload.isError) && <Notice tone="error">{problem ?? errorMessage(upload.error)}</Notice>}
      <Button className="h-11 self-start" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
        {upload.isPending ? t('signIn.sending') : t('receipt.submit')}
      </Button>
    </div>
  );
}

/** The demo's payment history (.m-payment-history): a table that scrolls sideways on a phone, or the empty state. */
function PaymentHistory({ payments }: { payments: PaymentView[] }) {
  const { t } = useI18n();
  const { paymentStatusLabels, refundReasonLabels } = useBillingLabels();
  return (
    <section className="m-surface m-payment-history" aria-labelledby="history-heading">
      <h3 id="history-heading">{t('history.title')}</h3>
      <p>{t('history.lead')}</p>
      {payments.length ? (
        <div className="m-table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('history.col.date')}</TableHead>
                <TableHead>{t('history.col.plan')}</TableHead>
                <TableHead>{t('history.col.amount')}</TableHead>
                <TableHead>{t('history.col.status')}</TableHead>
                <TableHead>{t('history.col.reference')}</TableHead>
                <TableHead>{t('history.col.note')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{formatDay(payment.createdAt)}</TableCell>
                  <TableCell>{payment.planName ?? t('open.plan')}</TableCell>
                  <TableCell>{formatMoney(payment.amountMinor, payment.currency)}</TableCell>
                  <TableCell>
                    <span className="m-tag">{paymentStatusLabels[payment.status]}</span>
                  </TableCell>
                  <TableCell className="font-mono">{payment.reference}</TableCell>
                  <TableCell>
                    {payment.message && !OPEN.includes(payment.status) ? payment.message : null}
                    {payment.refundReason && t('history.refund', { reason: refundReasonLabels[payment.refundReason].toLowerCase() })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="m-empty">
          <FileText size={28} aria-hidden="true" />
          <h3>{t('history.empty.title')}</h3>
          <p>{t('history.empty.body')}</p>
        </div>
      )}
    </section>
  );
}
