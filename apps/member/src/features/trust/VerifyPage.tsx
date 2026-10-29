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
import { SelectField, TextField } from '@/components/form/fields';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { errorMessage, post } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { keys, useHealth, useMe, useMyCases } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { caseStatusLabels, documentLabels, options } from '@/features/profile/options';

export default function VerifyPage() {
  return (
    <AppShell>
      <Link to="/" className="text-sm text-muted-foreground underline underline-offset-4">
        ← Your profiles
      </Link>
      <div className="mt-6">
        <PageTitle kicker="Verification" title="Your checks">
          Needed before a profile you publish can be shown: your phone verified by SMS and your identity document reviewed by
          our staff. Badges say “identity document reviewed”, nothing more.
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
  if (!me) return null;

  async function send(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizePhone(phone);
    if (!normalized) return setError('Enter the number with its country code, for example +94 77 123 4567.');
    setBusy(true);
    setError(null);
    const result = await authClient.phoneNumber.sendOtp({ phoneNumber: normalized });
    setBusy(false);
    if (result.error) return setError(result.error.message ?? 'Could not send the code.');
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
    if (result.error) return setError(result.error.message ?? 'That code did not work.');
    toast.success('Phone verified.');
    setSentTo(null);
    await queryClient.invalidateQueries();
  }

  return (
    <Card>
      <h2 className="font-serif text-2xl">Phone</h2>
      {me.phoneNumberVerified ? (
        <p className="mt-2 text-sm">
          <strong>{me.phoneNumber}</strong> is verified.
        </p>
      ) : sms === false ? (
        <div className="mt-4">
          <Notice tone="warning" title="SMS verification is not available yet">
            We will add it as soon as our SMS service is set up. Until then profiles cannot be published.
          </Notice>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {error && <Notice tone="error">{error}</Notice>}
          {!sentTo ? (
            <form onSubmit={send} className="flex flex-col gap-4">
              <TextField label="Mobile number" type="tel" autoComplete="tel" placeholder="+94 77 123 4567" value={phone} onChange={setPhone} />
              <Button type="submit" className="h-11 self-start" disabled={busy || !phone.trim()}>
                {busy ? 'Sending…' : 'Send code by SMS'}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="flex flex-col gap-4">
              <p className="text-sm">
                We sent a code to <strong>{sentTo}</strong>.
              </p>
              <TextField label="Code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(value) => setCode(value.replace(/\D/g, ''))} />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" className="h-11" disabled={busy || code.length !== 6}>
                  Verify
                </Button>
                <Button type="button" variant="outline" className="h-11" onClick={() => setSentTo(null)}>
                  Change number
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
  const [type, setType] = useState<DocumentType | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.set('documentType', type);
      form.set('file', file!);
      return post<VerificationCaseView>('/verification', form);
    },
    onSuccess: async () => {
      toast.success('Document sent for review.');
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
      <h2 className="font-serif text-2xl">Identity document</h2>
      {list.length > 0 && (
        <ul className="mt-4 divide-y text-sm">
          {list.map((c) => (
            <li key={c.id} className="py-3">
              <p className="font-semibold">
                {documentLabels[c.documentType]}: {caseStatusLabels[c.status]}
              </p>
              <p className="text-muted-foreground">Sent {new Date(c.submittedAt).toLocaleDateString()}</p>
              {c.decisionReason && <p className="mt-1">Reason: {c.decisionReason}</p>}
            </li>
          ))}
        </ul>
      )}
      {pending ? (
        <p className="mt-4 text-sm text-muted-foreground">Our staff will review it. You can keep editing your profile meanwhile.</p>
      ) : approved ? null : (
        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            upload.mutate();
          }}
        >
          {upload.isError && <Notice tone="error">{errorMessage(upload.error)}</Notice>}
          <SelectField label="Document" value={type} onChange={setType} options={options(documentLabels)} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="document-file" className="text-[13px] font-semibold">
              Photo of the document
            </label>
            <input
              id="document-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:min-h-10 file:rounded-[10px] file:border file:bg-card file:px-4 file:font-semibold"
            />
            <p className="text-xs text-muted-foreground">
              A clear JPEG, PNG or WebP photo, up to 5 MB. It is stored privately, seen only by our review staff, and deleted 90
              days after the review.
            </p>
          </div>
          <Button type="submit" className="h-11 self-start" disabled={upload.isPending || !type || !file}>
            {upload.isPending ? 'Uploading…' : 'Send for review'}
          </Button>
        </form>
      )}
    </Card>
  );
}
