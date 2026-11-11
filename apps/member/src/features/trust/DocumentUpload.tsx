/**
 * Sending an identity document (owner, 5 Nov 2026): choose the document, then add each photo it needs (the front and
 * back of an NIC or driving licence, a passport's photo page, and a selfie while the owner requires one). Every photo
 * is uploaded as soon as it is chosen and shown back as a preview that can be replaced or removed; Send for review
 * unlocks once every photo is in. On a computer, the photos can come from the webcam, a file, or a phone through a QR
 * code; on a phone, from its camera or gallery.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DocumentSide, DocumentType, PhoneLinkView, VerificationCaseView, VerificationDraftView } from '@fh/shared';
import { SelectField } from '@/components/form/fields';
import { Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { ApiError, del, errorMessage, post } from '@/lib/api';
import { dateNow, say, useI18n } from '@/lib/i18n';
import { keys, useDrafts, useServiceStatus } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { options, useLabels } from '@/features/profile/options';
import { CameraDialog, isTouchDevice, photoForm, QrCode, sideHint, sidesFor, sideTitle, useDraftPreview } from './document-photos';

const refreshDrafts = () => queryClient.invalidateQueries({ queryKey: keys.drafts });

/** The document chosen, remembered in this browser so a reload keeps the photos and their slots together. */
const TYPE_KEY = 'fh-document-type';
function savedType(): DocumentType | '' {
  try {
    const saved = localStorage.getItem(TYPE_KEY);
    return saved === 'nic' || saved === 'passport' || saved === 'driving_licence' ? saved : '';
  } catch {
    return '';
  }
}
function saveType(type: DocumentType | '') {
  try {
    if (type) localStorage.setItem(TYPE_KEY, type);
    else localStorage.removeItem(TYPE_KEY);
  } catch {
    // Storage is optional.
  }
}

export function DocumentUpload() {
  const drafts = useDrafts();
  const paused = Boolean(useServiceStatus().data?.documentSubmissionsPaused);
  const [type, setTypeState] = useState<DocumentType | ''>(savedType);
  const setType = (next: DocumentType | '') => {
    setTypeState(next);
    saveType(next);
  };
  const { t } = useI18n();
  const { documentLabels } = useLabels();
  const selfieRequired = Boolean(drafts.data?.selfieRequired);
  const sides = type ? sidesFor(type, selfieRequired) : [];
  const bySide = new Map((drafts.data?.drafts ?? []).map((draft) => [draft.side, draft]));
  const complete = sides.length > 0 && sides.every((side) => bySide.has(side));
  const send = useMutation({
    mutationFn: () => post<VerificationCaseView>('/verification', { documentType: type }),
    onSuccess: async () => {
      toast.success(say('verify.document.sent'));
      setType('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.cases }),
        refreshDrafts(),
        queryClient.invalidateQueries({ queryKey: keys.profiles }),
      ]);
    },
    // A document already waiting (sent from another tab, or this page was behind): show that state instead of an error.
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VERIFICATION_PENDING') void queryClient.invalidateQueries({ queryKey: keys.cases });
    },
  });
  const touch = isTouchDevice();

  return (
    <div className="mt-5 flex flex-col gap-5">
      {paused && (
        <Notice tone="warning" title={t('verify.document.paused.title')}>
          {t('verify.document.paused.body')}
        </Notice>
      )}
      <SelectField label={t('verify.document.type')} value={type} onChange={setType} options={options(documentLabels)} />
      <div className="rounded-[12px] border bg-[var(--ui-soft)] p-4 text-sm">
        <p className="font-semibold">{t('docs.tips.title')}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{t('docs.tips.flat')}</li>
          <li>{t('docs.tips.corners')}</li>
          <li>{t('docs.tips.glare')}</li>
          <li>{t('docs.tips.original')}</li>
        </ul>
      </div>
      {type && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {sides.map((side) => (
              <SideSlot key={side} type={type} side={side} draft={bySide.get(side) ?? null} disabled={paused} />
            ))}
          </div>
          {!touch && <PhoneHandoff type={type} disabled={paused} open={Boolean(drafts.data?.phoneLink)} />}
        </>
      )}
      <p className="text-xs text-muted-foreground">{t('docs.privacy')}</p>
      {send.isError && <Notice tone="error">{errorMessage(send.error)}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <Button className="h-11" disabled={paused || !complete || send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? t('docs.sending') : t('verify.document.submit')}
        </Button>
        {type && !complete && (
          <p className="text-sm text-muted-foreground" role="status">
            {t('docs.stillNeeded', { count: sides.filter((side) => !bySide.has(side)).length })}
          </p>
        )}
      </div>
    </div>
  );
}

/** One photo of the document: empty with ways to add it, or a preview with ways to change it. */
function SideSlot({ type, side, draft, disabled }: { type: DocumentType; side: DocumentSide; draft: VerificationDraftView | null; disabled: boolean }) {
  const { t } = useI18n();
  const title = sideTitle(t, type, side);
  const preview = useDraftPreview(draft?.id ?? null);
  const takeInput = useRef<HTMLInputElement>(null);
  const chooseInput = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const touch = isTouchDevice();
  const upload = useMutation({
    mutationFn: async (photo: Blob) => post<VerificationDraftView>('/verification/drafts', await photoForm(side, photo)),
    onSuccess: refreshDrafts,
  });
  const remove = useMutation({ mutationFn: (id: string) => del(`/verification/drafts/${id}`), onSuccess: refreshDrafts });
  const picked = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (file) upload.mutate(file);
  };
  const busy = disabled || upload.isPending || remove.isPending;
  const failed = upload.error ?? remove.error;

  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-[12px] border p-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{sideHint(t, type, side)}</p>
      </div>
      <div className="grid aspect-[3/2] place-items-center overflow-hidden rounded-[10px] border border-dashed bg-[var(--ui-soft)]">
        {draft && preview ? (
          <img src={preview} alt={t('docs.previewAlt', { side: title })} className="size-full object-contain" />
        ) : (
          <p className="px-4 text-center text-sm text-muted-foreground">{upload.isPending ? t('docs.uploading') : draft ? t('docs.loadingPreview') : t('docs.empty')}</p>
        )}
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {upload.isPending ? t('docs.uploading') : draft ? (draft.via === 'phone' ? t('docs.addedFromPhone') : t('docs.added')) : ''}
      </p>
      {failed && <Notice tone="error">{errorMessage(failed)}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-10" disabled={busy} onClick={() => (touch ? takeInput.current?.click() : setCamera(true))}>
          {draft ? t('docs.retake') : t('docs.take')}
        </Button>
        <Button variant="outline" className="h-10" disabled={busy} onClick={() => chooseInput.current?.click()}>
          {draft ? t('docs.replace') : t('docs.choose')}
        </Button>
        {draft && (
          <Button variant="ghost" className="h-10 text-destructive" disabled={busy} onClick={() => remove.mutate(draft.id)}>
            {t('docs.remove')}
          </Button>
        )}
      </div>
      {/* The phone's own camera app (capture), or its gallery and files. Hidden: the buttons above open them. */}
      <input ref={takeInput} type="file" accept="image/*" capture={side === 'selfie' ? 'user' : 'environment'} hidden onChange={(e) => picked(e.currentTarget)} />
      <input ref={chooseInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(e) => picked(e.currentTarget)} />
      <CameraDialog
        open={camera}
        title={t('docs.camera.title', { side: title })}
        facing={side === 'selfie' ? 'user' : 'environment'}
        onClose={() => setCamera(false)}
        onCapture={(photo) => {
          setCamera(false);
          upload.mutate(photo);
        }}
      />
    </section>
  );
}

/** "Use your phone instead": a QR code whose photos appear here as they arrive (useDrafts checks every 3 seconds). */
function PhoneHandoff({ type, disabled, open }: { type: DocumentType; disabled: boolean; open: boolean }) {
  const { t } = useI18n();
  const [link, setLink] = useState<PhoneLinkView | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const create = useMutation({
    mutationFn: () => post<PhoneLinkView>('/verification/phone-link', { documentType: type }),
    onSuccess: async (made) => {
      setLink(made);
      setNow(Date.now());
      await refreshDrafts();
    },
  });
  const close = useMutation({
    mutationFn: () => del('/verification/phone-link'),
    onSuccess: async () => {
      setLink(null);
      await refreshDrafts();
    },
  });
  useEffect(() => {
    if (!link) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [link]);
  // A link made for another document, or closed elsewhere (sent, or a new one): forget it here too.
  useEffect(() => setLink(null), [type]);
  useEffect(() => {
    if (!open) setLink(null);
  }, [open]);
  const minutesLeft = link ? Math.max(0, Math.ceil((new Date(link.expiresAt).getTime() - now) / 60_000)) : 0;
  const ended = Boolean(link) && minutesLeft === 0;

  return (
    <section aria-labelledby="phone-handoff-title" className="rounded-[12px] border p-4">
      <h3 id="phone-handoff-title" className="font-semibold">
        {t('docs.phone.title')}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{t('docs.phone.body')}</p>
      {create.isError && (
        <div className="mt-3">
          <Notice tone="error">{errorMessage(create.error)}</Notice>
        </div>
      )}
      {link && !ended ? (
        <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
          <QrCode value={link.url} label={t('docs.phone.alt')} />
          <div className="flex flex-col gap-2 text-sm">
            <p role="status">{t('docs.phone.left', { count: minutesLeft, time: dateNow(link.expiresAt, 'when') })}</p>
            <p className="text-muted-foreground">{t('docs.phone.warning')}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-10" disabled={create.isPending} onClick={() => create.mutate()}>
                {t('docs.phone.new')}
              </Button>
              <Button variant="ghost" className="h-10" disabled={close.isPending} onClick={() => close.mutate()}>
                {t('docs.phone.close')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-start gap-2">
          {ended && <p className="text-sm">{t('docs.phone.ended')}</p>}
          <Button variant="outline" className="h-10" disabled={disabled || create.isPending} onClick={() => create.mutate()}>
            {ended ? t('docs.phone.new') : t('docs.phone.show')}
          </Button>
        </div>
      )}
    </section>
  );
}
