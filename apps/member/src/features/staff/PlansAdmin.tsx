/**
 * The owner's plans (owner decision, 29 Oct 2026: full control). Add a plan, edit it, change a price (a new price
 * version from now; payments already started keep theirs), retire it, or delete one nobody ever bought or was
 * granted. Edits apply to new payments only. Every change is audited.
 */
import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CURRENCIES, PLAN_TIERS, type OwnerPlanView } from '@fh/shared';
import { Confirm } from '@/components/confirm';
import { SelectField, TextAreaField, TextField } from '@/components/form/fields';
import { Card, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { ApiError, del, errorMessage, patch, post } from '@/lib/api';
import { formatDay, formatMoney, moneyInput, parseMoney } from '@/lib/format';
import { useOwnerPlans } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { limitsText, termText } from '@/features/billing/labels';

type Tier = (typeof PLAN_TIERS)[number];
type Currency = (typeof CURRENCIES)[number];

const tierLabels: Record<Tier, string> = { starter: 'Starter', premium: 'Premium' };
const refresh = () => queryClient.invalidateQueries({ queryKey: ['owner'] });
const whole = (value: string) => value.replace(/\D/g, '').slice(0, 5);

/** "Premium 12 months" → "premium_12_months": a starting code the owner can change. */
const codeFrom = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'plan_$1')
    .slice(0, 40);

type Draft = {
  name: string;
  description: string;
  tier: Tier | '';
  level: string;
  sortOrder: string;
  termMonths: string;
  dailyRequestCap: string;
  monthlyRequestCap: string;
};

const emptyDraft: Draft = { name: '', description: '', tier: '', level: '', sortOrder: '0', termMonths: '1', dailyRequestCap: '', monthlyRequestCap: '' };

const draftOf = (plan: OwnerPlanView): Draft => ({
  name: plan.name,
  description: plan.description ?? '',
  tier: plan.tier,
  level: String(plan.level),
  sortOrder: String(plan.sortOrder),
  termMonths: String(plan.termMonths),
  dailyRequestCap: String(plan.dailyRequestCap),
  monthlyRequestCap: plan.monthlyRequestCap === null ? '' : String(plan.monthlyRequestCap),
});

const fieldsOf = (draft: Draft) => ({
  name: draft.name.trim(),
  description: draft.description.trim() || null,
  tier: draft.tier,
  level: Number(draft.level),
  sortOrder: Number(draft.sortOrder || 0),
  termMonths: Number(draft.termMonths),
  dailyRequestCap: Number(draft.dailyRequestCap),
  monthlyRequestCap: draft.monthlyRequestCap ? Number(draft.monthlyRequestCap) : null,
});

const draftReady = (draft: Draft) =>
  draft.name.trim().length >= 2 && draft.tier !== '' && Number(draft.level) >= 1 && Number(draft.termMonths) >= 1 && Number(draft.dailyRequestCap) >= 1;

function PlanFields({ draft, onChange, errors }: { draft: Draft; onChange: (draft: Draft) => void; errors: Record<string, string> }) {
  const set = (key: keyof Draft) => (value: string) => onChange({ ...draft, [key]: value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField label="Name" value={draft.name} onChange={set('name')} maxLength={40} error={errors.name} />
      <SelectField label="Kind" value={draft.tier} onChange={set('tier')} options={PLAN_TIERS.map((value) => ({ value, label: tierLabels[value] }))} error={errors.tier} />
      <TextAreaField
        label="Short description (optional)"
        className="sm:col-span-2"
        rows={2}
        maxLength={200}
        value={draft.description}
        onChange={set('description')}
      />
      <TextField
        label="Level"
        hint="Higher is better: a higher level is an upgrade, the same level a renewal, a lower one waits until the plan ends."
        inputMode="numeric"
        value={draft.level}
        onChange={(value) => set('level')(whole(value).slice(0, 2))}
        error={errors.level}
      />
      <TextField label="Position in the list" hint="Lower comes first." inputMode="numeric" value={draft.sortOrder} onChange={(value) => set('sortOrder')(whole(value).slice(0, 3))} error={errors.sortOrder} />
      <TextField label="Length in months" inputMode="numeric" value={draft.termMonths} onChange={(value) => set('termMonths')(whole(value).slice(0, 2))} error={errors.termMonths} />
      <TextField label="Requests a day" inputMode="numeric" value={draft.dailyRequestCap} onChange={(value) => set('dailyRequestCap')(whole(value).slice(0, 3))} error={errors.dailyRequestCap} />
      <TextField
        label="Requests a month (optional)"
        hint="Empty: no monthly limit, shown as “unlimited (fair use)”."
        inputMode="numeric"
        value={draft.monthlyRequestCap}
        onChange={(value) => set('monthlyRequestCap')(whole(value))}
        error={errors.monthlyRequestCap}
      />
    </div>
  );
}

export function PlansAdmin() {
  const plans = useOwnerPlans();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageTitle kicker="Owner" title="Plans and prices">
        Changes apply to new payments. A payment already started keeps the plan and price it was quoted.
      </PageTitle>
      {adding ? (
        <NewPlan onDone={() => setAdding(false)} />
      ) : (
        <Button className="mb-6 h-11" onClick={() => setAdding(true)}>
          Add a plan
        </Button>
      )}
      {plans.isPending ? (
        <Loading />
      ) : plans.isError ? (
        <Notice tone="error">{errorMessage(plans.error)}</Notice>
      ) : (
        <div className="flex flex-col gap-4">
          {plans.data.map((plan) => (
            <PlanItem key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </>
  );
}

function NewPlan({ onDone }: { onDone: () => void }) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [prices, setPrices] = useState<Record<Currency, string>>({ LKR: '', USD: '' });
  const create = useMutation({
    mutationFn: () =>
      post<OwnerPlanView>('/owner/plans', {
        id: codeTouched ? code : codeFrom(draft.name),
        ...fieldsOf(draft),
        prices: { LKR: parseMoney(prices.LKR), USD: parseMoney(prices.USD) },
      }),
    onSuccess: async (plan) => {
      toast.success(`${plan.name} added. Members can buy it now.`);
      await refresh();
      onDone();
    },
  });
  const errors = create.error instanceof ApiError ? create.error.fields : {};
  const priceProblem = (['LKR', 'USD'] as const).some((c) => prices[c] && parseMoney(prices[c]) === null);
  const hasPrice = (['LKR', 'USD'] as const).some((c) => parseMoney(prices[c]) !== null);
  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }
  return (
    <Card className="mb-6">
      <h2 className="font-serif text-2xl">New plan</h2>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        {create.isError && <Notice tone="error">{errorMessage(create.error)}</Notice>}
        <PlanFields
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            if (!codeTouched) setCode(codeFrom(next.name));
          }}
          errors={errors}
        />
        <TextField
          label="Code"
          hint="Fixed once created; it appears in records. Lowercase letters, digits and underscores."
          value={code}
          onChange={(value) => {
            setCodeTouched(true);
            setCode(value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
          }}
          maxLength={40}
          error={errors.id}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Price in LKR (Sri Lanka)" hint="For example 3000 or 3,000.00. Empty: not sold in LKR." inputMode="numeric" value={prices.LKR} onChange={(value) => setPrices({ ...prices, LKR: value })} />
          <TextField label="Price in USD (abroad)" hint="For example 20. Empty: not sold in USD." inputMode="numeric" value={prices.USD} onChange={(value) => setPrices({ ...prices, USD: value })} />
        </div>
        {priceProblem && <Notice tone="error">Enter prices as numbers, for example 3000 or 3,000.50.</Notice>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" className="h-11" disabled={!draftReady(draft) || !hasPrice || priceProblem || create.isPending}>
            {create.isPending ? 'Adding…' : 'Add plan'}
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PlanItem({ plan }: { plan: OwnerPlanView }) {
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  const used = plan.usage.payments + plan.usage.grants > 0;
  const toggle = useMutation({
    mutationFn: () => patch(`/owner/plans/${plan.id}`, { active: !plan.active }),
    onSuccess: async () => {
      toast.success(plan.active ? `${plan.name} retired: no longer sold.` : `${plan.name} is on sale again.`);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => del(`/owner/plans/${plan.id}`),
    onSuccess: async () => {
      toast.success(`${plan.name} deleted.`);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Card className={plan.active ? undefined : 'opacity-80'}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-serif text-xl">
          {plan.name} {!plan.active && <span className="text-sm font-sans font-semibold text-muted-foreground">(retired)</span>}
        </h3>
        <p className="text-sm font-semibold">
          {plan.prices.length ? plan.prices.map((p) => formatMoney(p.amountMinor, p.currency)).join(' · ') : 'No price'}
        </p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        <span className="font-mono">{plan.id}</span> · {tierLabels[plan.tier]} · level {plan.level} · position {plan.sortOrder} ·{' '}
        {termText(plan.termMonths)} · {limitsText(plan)}
      </p>
      {plan.description && <p className="mt-2 text-sm">{plan.description}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        Bought {plan.usage.payments} time{plan.usage.payments === 1 ? '' : 's'}; {plan.usage.grants} plan event{plan.usage.grants === 1 ? '' : 's'}.
      </p>

      {editing ? (
        <EditPlan plan={plan} onDone={() => setEditing(false)} />
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" className="h-11" onClick={() => setEditing(true)}>
            Edit plan and prices
          </Button>
          <Button variant="outline" className="h-11" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
            {plan.active ? 'Retire (stop selling)' : 'Put back on sale'}
          </Button>
          {used ? (
            <p className="self-center text-xs text-muted-foreground">Bought or granted before, so it can be retired but not deleted.</p>
          ) : (
            <Confirm
              title={`Delete ${plan.name}?`}
              action="Delete plan"
              destructive
              onConfirm={() => remove.mutate()}
              trigger={
                <Button variant="ghost" className="h-11" disabled={remove.isPending}>
                  Delete
                </Button>
              }
            >
              <p>Nobody has bought it, so it and its prices are removed. This cannot be undone.</p>
            </Confirm>
          )}
        </div>
      )}

      <button type="button" className="mt-4 text-sm text-brand underline underline-offset-4" onClick={() => setHistory(!history)}>
        {history ? 'Hide price history' : 'Show price history'}
      </button>
      {history && (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {plan.priceHistory.map((version) => (
            <li key={version.id}>
              {formatMoney(version.amountMinor, version.currency)}: from {formatDay(version.effectiveFrom)}
              {version.effectiveTo ? ` to ${formatDay(version.effectiveTo)}` : ' (current)'}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EditPlan({ plan, onDone }: { plan: OwnerPlanView; onDone: () => void }) {
  const [draft, setDraft] = useState<Draft>(draftOf(plan));
  const current = (currency: Currency) => plan.prices.find((p) => p.currency === currency)?.amountMinor ?? null;
  const [prices, setPrices] = useState<Record<Currency, string>>({
    LKR: current('LKR') === null ? '' : moneyInput(current('LKR')!),
    USD: current('USD') === null ? '' : moneyInput(current('USD')!),
  });
  const save = useMutation({
    mutationFn: async () => {
      // Only what changed, so the audit trail shows the real edit.
      const before = fieldsOf(draftOf(plan));
      const changes = Object.fromEntries(Object.entries(fieldsOf(draft)).filter(([key, value]) => before[key as keyof typeof before] !== value));
      if (Object.keys(changes).length > 0) await patch(`/owner/plans/${plan.id}`, changes);
      for (const currency of ['LKR', 'USD'] as const) {
        const next = prices[currency] ? parseMoney(prices[currency]) : null;
        if (next !== current(currency)) await post(`/owner/plans/${plan.id}/prices`, { currency, amountMinor: next });
      }
    },
    onSuccess: async () => {
      toast.success('Plan saved.');
      await refresh();
      onDone();
    },
    onError: async () => refresh(),
  });
  const errors = save.error instanceof ApiError ? save.error.fields : {};
  const priceProblem = (['LKR', 'USD'] as const).some((c) => prices[c] && parseMoney(prices[c]) === null);
  const noPrice = (['LKR', 'USD'] as const).every((c) => !prices[c]);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
      className="mt-4 flex flex-col gap-4 border-t pt-4"
    >
      {save.isError && <Notice tone="error">{errorMessage(save.error)}</Notice>}
      <PlanFields draft={draft} onChange={setDraft} errors={errors} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Price in LKR (Sri Lanka)" hint="Empty: stop selling in LKR." inputMode="numeric" value={prices.LKR} onChange={(value) => setPrices({ ...prices, LKR: value })} />
        <TextField label="Price in USD (abroad)" hint="Empty: stop selling in USD." inputMode="numeric" value={prices.USD} onChange={(value) => setPrices({ ...prices, USD: value })} />
      </div>
      {priceProblem && <Notice tone="error">Enter prices as numbers, for example 3000 or 3,000.50.</Notice>}
      {noPrice && plan.active && <Notice tone="warning">Without any price, members cannot buy this plan.</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="h-11" disabled={!draftReady(draft) || priceProblem || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
