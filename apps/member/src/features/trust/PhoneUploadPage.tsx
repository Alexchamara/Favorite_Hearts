/**
 * The page a document QR code opens on a phone (owner, 5 Nov 2026): take or choose each photo the document needs, and
 * they go straight to the member's unsent photos on the computer. It needs no sign-in: the link's token (after "#",
 * so never in a page request) allows only adding photos for 15 minutes, and the page never learns whose they are.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DOCUMENT_TYPES, type DocumentSide, type DocumentType, type PhoneUploadStatus } from '@fh/shared';
import { AppShell, Card, Loading, Notice, PageTitle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { photoForm, sideHint, sidesFor, sideTitle } from './document-photos';

const TOKEN_KEY = 'fh-upload-token';

/**
 * The token from the address, kept for this tab only (a reload still works) and taken out of the address bar, so it
 * is not shown, bookmarked or shared by accident.
 */
function readToken(): string | null {
  const fromHash = window.location.hash.slice(1);
  if (fromHash) {
    try {
      sessionStorage.setItem(TOKEN_KEY, fromHash);
    } catch {
      // Storage is optional: this visit still works.
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return fromHash;
  }
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export default function PhoneUploadPage() {
  const [token] = useState(readToken);
  const asked = new URLSearchParams(window.location.search).get('document');
  const type: DocumentType = (DOCUMENT_TYPES as readonly string[]).includes(asked ?? '') ? (asked as DocumentType) : 'nic';
  const { t } = useI18n();
  const headers = { 'x-upload-token': token ?? '' };
  const status = useQuery({
    queryKey: ['verification-link', token],
    queryFn: () => api<PhoneUploadStatus>('/verification-link', { headers }),
    enabled: Boolean(token),
    retry: false,
  });
  const ended = !token || (status.error instanceof ApiError && status.error.status === 410);
  const sides = sidesFor(type, Boolean(status.data?.selfieRequired));
  const uploaded = new Set(status.data?.uploaded ?? []);
  const done = Boolean(status.data) && sides.every((side) => uploaded.has(side));

  return (
    <AppShell>
      <PageTitle kicker={t('verify.kicker')} title={t('phoneUpload.title')}>
        {t('phoneUpload.intro')}
      </PageTitle>
      {ended ? (
        <Notice tone="warning">{t('phoneUpload.ended')}</Notice>
      ) : status.isPending ? (
        <Loading />
      ) : status.isError ? (
        <Notice tone="error">{errorMessage(status.error)}</Notice>
      ) : (
        <div className="flex flex-col gap-4">
          {done && (
            <Notice title={t('phoneUpload.done.title')}>{t('phoneUpload.done.body')}</Notice>
          )}
          {sides.map((side) => (
            <PhoneSide key={side} type={type} side={side} uploaded={uploaded.has(side)} headers={headers} onUploaded={() => void status.refetch()} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function PhoneSide({ type, side, uploaded, headers, onUploaded }: { type: DocumentType; side: DocumentSide; uploaded: boolean; headers: Record<string, string>; onUploaded: () => void }) {
  const { t } = useI18n();
  const title = sideTitle(t, type, side);
  const takeInput = useRef<HTMLInputElement>(null);
  const chooseInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: async (photo: File) => api('/verification-link/drafts', { method: 'POST', body: await photoForm(side, photo), headers }),
    onSuccess: onUploaded,
  });
  const picked = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    upload.mutate(file);
  };
  return (
    <Card>
      <h2 className="font-serif text-xl">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{sideHint(t, type, side)}</p>
      {preview && <img src={preview} alt={t('docs.previewAlt', { side: title })} className="mt-3 max-h-64 w-full rounded-[10px] object-contain" />}
      <p role="status" className="mt-2 text-sm font-semibold">
        {upload.isPending ? t('docs.uploading') : uploaded ? t('phoneUpload.sent') : ''}
      </p>
      {upload.isError && (
        <div className="mt-2">
          <Notice tone="error">{errorMessage(upload.error)}</Notice>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="h-11" disabled={upload.isPending} onClick={() => takeInput.current?.click()}>
          {uploaded ? t('docs.retake') : t('docs.take')}
        </Button>
        <Button variant="outline" className="h-11" disabled={upload.isPending} onClick={() => chooseInput.current?.click()}>
          {t('phoneUpload.gallery')}
        </Button>
      </div>
      <input ref={takeInput} type="file" accept="image/*" capture={side === 'selfie' ? 'user' : 'environment'} hidden onChange={(e) => picked(e.currentTarget)} />
      <input ref={chooseInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(e) => picked(e.currentTarget)} />
    </Card>
  );
}
