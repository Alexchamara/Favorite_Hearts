/**
 * The account's own checks for publishing (OWNER-DECISIONS section 5): a phone verified by SMS
 * code, and an identity document (NIC, passport or driving licence) reviewed by staff. Documents
 * are uploaded only here (section 8: never by WhatsApp or email).
 */
import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { normalizePhone, type DocumentType, type VerificationCaseView } from '@fh/shared';
import { PhoneField, SelectField, TextField } from '@/components/form/fields';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import { useBotCheck } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { errorMessage, post } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { keys, useHealth, useMe, useMyCases, useServiceStatus } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { authErrorMessage } from '@/features/auth/login-code';
import { options, useLabels } from '@/features/profile/options';
import { formatDay } from '@/lib/format';
import { say, useI18n } from '@/lib/i18n';

export default function VerifyPage() {
  const { t } = useI18n();
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
        </div>
      </div>
    </AppShell>
  );
}

function PhoneCheck() {
  const me = useMe().data;
  const sms = useHealth().data?.sms;
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bot = useBotCheck();
  const { t, rich } = useI18n();
  if (!me) return null;

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
    setCode('');
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    const result = await authClient.phoneNumber.verify({ phoneNumber: sentTo, code, updatePhoneNumber: sentTo !== me?.phoneNumber });
    setBusy(false);
    if (result.error) return setError(authErrorMessage(result.error));
    toast.success(say('verify.phone.done'));
    setSentTo(null);
    await queryClient.invalidateQueries();
  }

  return (
    <Card>
      <h2 className="font-serif text-2xl">{t('verify.phone.title')}</h2>
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
              <PhoneField label={t('signIn.mobile')} value={phone} onChange={setPhone} />
              {bot.widget}
              <Button type="submit" className="h-11 self-start" disabled={busy || !phone.trim() || !bot.ready}>
                {busy ? t('signIn.sending') : t('verify.phone.send')}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="flex flex-col gap-4">
              <p className="text-sm">{rich('verify.phone.sent', { strong: (words) => <strong>{words}</strong> }, { phone: sentTo })}</p>
              <TextField label={t('signIn.code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(value) => setCode(value.replace(/\D/g, ''))} />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" className="h-11" disabled={busy || code.length !== 6}>
                  {t('verify.phone.verify')}
                </Button>
                <Button type="button" variant="outline" className="h-11" onClick={() => setSentTo(null)}>
                  {t('verify.phone.change')}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}

function DocumentCheck() {
  const cases = useMyCases();
  const paused = Boolean(useServiceStatus().data?.documentSubmissionsPaused);
  const [type, setType] = useState<DocumentType | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const { t } = useI18n();
  const { caseStatusLabels, documentLabels } = useLabels();
  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.set('documentType', type);
      form.set('file', file!);
      return post<VerificationCaseView>('/verification', form);
    },
    onSuccess: async () => {
      toast.success(say('verify.document.sent'));
      setFile(null);
      setType('');
      await queryClient.invalidateQueries({ queryKey: keys.cases });
      await queryClient.invalidateQueries({ queryKey: keys.profiles });
    },
  });
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
      {pending ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('verify.document.pending')}</p>
      ) : approved ? null : (
        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            upload.mutate();
          }}
        >
          {paused && (
            <Notice tone="warning" title={t('verify.document.paused.title')}>
              {t('verify.document.paused.body')}
            </Notice>
          )}
          {upload.isError && <Notice tone="error">{errorMessage(upload.error)}</Notice>}
          <SelectField label={t('verify.document.type')} value={type} onChange={setType} options={options(documentLabels)} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="document-file" className="text-[13px] font-semibold">
              {t('verify.document.photo')}
            </label>
            <input
              id="document-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:min-h-10 file:rounded-[10px] file:border file:bg-card file:px-4 file:font-semibold"
            />
            <p className="text-xs text-muted-foreground">{t('verify.document.hint')}</p>
          </div>
          <Button type="submit" className="h-11 self-start" disabled={paused || upload.isPending || !type || !file}>
            {upload.isPending ? t('verify.document.uploading') : t('verify.document.submit')}
          </Button>
        </form>
      )}
    </Card>
  );
}
