/**
 * The account's own checks for publishing (OWNER-DECISIONS section 5): a phone verified by SMS
 * code, and an identity document (NIC, passport or driving licence) reviewed by staff. Documents
 * are uploaded only here (section 8: never by WhatsApp or email).
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { normalizePhone } from '@fh/shared';
import { CodeInput, useCodeCheck } from '@/components/form/code-input';
import { PhoneField } from '@/components/form/fields';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import { useBotCheck } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { useHealth, useMe, useMyCases, useProfile } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { authErrorMessage } from '@/features/auth/login-code';
import { useLabels } from '@/features/profile/options';
import { formatDay } from '@/lib/format';
import { DocumentUpload } from './DocumentUpload';
import { say, useI18n } from '@/lib/i18n';

export default function VerifyPage() {
  const { t } = useI18n();
  // Opened from a profile's setup guide (?profile=…): offer the way back to publish it.
  const [params] = useSearchParams();
  const fromProfile = params.get('profile');
  return (
    <AppShell>
      <Link to="/" className="text-sm text-muted-foreground underline underline-offset-4">
        {t('verify.back')}
      </Link>
      <div className="mt-6">
        <PageTitle kicker={t('verify.kicker')} title={t('verify.title')}>
          {t('verify.intro')}
        </PageTitle>
        <div className="flex flex-col gap-6">
          <PhoneCheck />
          <DocumentCheck />
          {fromProfile && <BackToProfile id={fromProfile} />}
        </div>
      </div>
    </AppShell>
  );
}

function BackToProfile({ id }: { id: string }) {
  const { t } = useI18n();
  const profile = useProfile(id);
  if (!profile.data) return null;
  return (
    <Card>
      <Button asChild className="h-11">
        <Link to={`/profiles/${id}`}>{t('verify.backToProfile', { name: profile.data.fields.displayName ?? t('card.untitled') })} →</Link>
      </Button>
    </Card>
  );
}

/**
 * The account holder's phone, checked by SMS. `embedded`: inside another card (the profile's Verify step), as its
 * last part. `suggested`: a number to start from, e.g. the phone just added as a contact, so nobody types it twice.
 */
export function PhoneCheck({ embedded = false, suggested }: { embedded?: boolean; suggested?: string } = {}) {
  const me = useMe().data;
  const sms = useHealth().data?.sms;
  const [phone, setPhone] = useState(suggested ?? '');
  useEffect(() => {
    if (suggested) setPhone((current) => current || suggested);
  }, [suggested]);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bot = useBotCheck();
  const { t, rich } = useI18n();

  async function send(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizePhone(phone);
    if (!normalized) return setError(t('verify.phone.formatHint'));
    setBusy(true);
    setError(null);
    const result = await authClient.phoneNumber.sendOtp({ phoneNumber: normalized, fetchOptions: { headers: bot.headers } });
    bot.reset();
    setBusy(false);
    if (result.error) return setError(authErrorMessage(result.error));
    setSentTo(normalized);
    entry.reset();
  }
  // Checked as soon as all six digits are in, like the sign-in code.
  const entry = useCodeCheck(
    async (value) => {
      if (!sentTo) return;
      const result = await authClient.phoneNumber.verify({ phoneNumber: sentTo, code: value, updatePhoneNumber: sentTo !== me?.phoneNumber });
      if (result.error) throw new Error(authErrorMessage(result.error));
    },
    async () => {
      toast.success(say('verify.phone.done'));
      setSentTo(null);
      await queryClient.invalidateQueries();
    },
  );
  if (!me) return null;

  const Frame = embedded ? EmbeddedFrame : Card;
  return (
    <Frame>
      {embedded ? (
        <h3 className="font-semibold">{t('verify.phone.embeddedTitle')}</h3>
      ) : (
        <h2 className="font-serif text-2xl">{t('verify.phone.title')}</h2>
      )}
      {me.phoneNumberVerified ? (
        <p className="mt-2 text-sm">
          {rich('verify.phone.isVerified', { strong: (words) => <strong>{words}</strong> }, { phone: me.phoneNumber ?? '' })}
        </p>
      ) : sms === false ? (
        <div className="mt-4">
          <Notice tone="warning" title={t('verify.phone.smsUnavailable.title')}>
            {t('verify.phone.smsUnavailable.body')}
          </Notice>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {error && <Notice tone="error">{error}</Notice>}
          {!sentTo ? (
            <form onSubmit={send} className="flex flex-col gap-4">
              <PhoneField
                label={t('signIn.mobile')}
                value={phone}
                onChange={setPhone}
                hint={suggested && phone === suggested ? t('verify.phone.suggestedHint') : undefined}
              />
              {bot.widget}
              <Button type="submit" className="h-11 self-start" disabled={busy || !phone.trim() || !bot.ready}>
                {busy ? t('signIn.sending') : t('verify.phone.send')}
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm">{rich('verify.phone.sent', { strong: (words) => <strong>{words}</strong> }, { phone: sentTo })}</p>
              <CodeInput label={t('signIn.code')} value={entry.value} onChange={entry.change} state={entry.state} message={entry.message} fromSms />
              <Button type="button" variant="outline" className="h-11 self-start" disabled={entry.state === 'checking'} onClick={() => setSentTo(null)}>
                {t('verify.phone.change')}
              </Button>
            </div>
          )}
        </div>
      )}
    </Frame>
  );
}

/** A part of a bigger card: a line above it instead of its own card. */
function EmbeddedFrame({ children }: { children: ReactNode }) {
  return <section className="mt-6 border-t pt-5">{children}</section>;
}

export function DocumentCheck() {
  const cases = useMyCases();
  const { t } = useI18n();
  const { caseStatusLabels, documentLabels } = useLabels();
  if (cases.isPending) return <Loading />;
  const list = cases.data ?? [];
  const pending = list.some((c) => c.status === 'pending');
  const approved = list.some((c) => c.status === 'approved');

  return (
    <Card>
      <h2 className="font-serif text-2xl">{t('verify.document.title')}</h2>
      {list.length > 0 && (
        <ul className="mt-4 divide-y text-sm">
          {list.map((c) => (
            <li key={c.id} className="py-3">
              <p className="font-semibold">
                {t('dashboard.verification.documentStatus', { document: documentLabels[c.documentType], status: caseStatusLabels[c.status] })}
              </p>
              <p className="text-muted-foreground">{t('verify.document.sentOn', { date: formatDay(c.submittedAt) })}</p>
              {c.decisionReason && <p className="mt-1">{t('verify.document.reason', { reason: c.decisionReason })}</p>}
            </li>
          ))}
        </ul>
      )}
      {pending ? <p className="mt-4 text-sm text-muted-foreground">{t('verify.document.pending')}</p> : approved ? null : <DocumentUpload />}
    </Card>
  );
}
