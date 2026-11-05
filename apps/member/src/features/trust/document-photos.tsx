/**
 * The pieces both document screens use (owner, 5 Nov 2026): which photos a document needs and what each is called,
 * previews of the member's own unsent photos, a QR code, the computer's camera, and making a photo smaller on the
 * device before it is sent (quicker on mobile data, and the photo's location is dropped before it leaves the phone).
 */
import { useEffect, useRef, useState } from 'react';
import { encode } from 'uqr';
import { requiredSides, type DocumentSide, type DocumentType } from '@fh/shared';
import { Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { env } from '@/lib/env';
import { useI18n, type Translate } from '@/lib/i18n';

export const sidesFor = (type: DocumentType, selfieRequired: boolean): DocumentSide[] => requiredSides(type, selfieRequired);

/** "Front of your NIC", "Photo page of your passport", "A selfie holding your document". */
export function sideTitle(t: Translate, type: DocumentType, side: DocumentSide): string {
  if (side === 'selfie') return t('docs.side.selfie');
  return t(`docs.side.${type}.${side}` as Parameters<Translate>[0]);
}

export function sideHint(t: Translate, type: DocumentType, side: DocumentSide): string {
  if (side === 'selfie') return t('docs.hint.selfie');
  if (type === 'passport') return t('docs.hint.passport');
  return t(side === 'front' ? 'docs.hint.front' : 'docs.hint.back');
}

/** Phones and tablets: "Take photo" opens the device's own camera app; computers use the webcam window below. */
export const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** The photo's longest side after shrinking: the server keeps documents at this size too (storage/images.ts). */
const MAX_PIXELS = 2400;

/**
 * Re-draws a photo at most MAX_PIXELS wide or high, as JPEG, turned the right way up. Formats the browser cannot draw
 * (HEIC outside Safari) are sent as they are: the server checks and converts them, or explains what to do.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_PIXELS / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const shrunk = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return shrunk ?? file;
  } catch {
    return file;
  }
}

/** The form one photo is sent in. */
export async function photoForm(side: DocumentSide, file: Blob): Promise<FormData> {
  const form = new FormData();
  form.set('side', side);
  form.set('file', new File([await shrinkPhoto(file)], `${side}.jpg`, { type: 'image/jpeg' }));
  return form;
}

/** A preview of one of the member's own unsent photos, fetched with their session (never a storage link). */
export function useDraftPreview(draftId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!draftId) return setUrl(null);
    let made: string | null = null;
    let cancelled = false;
    void fetch(`${env.apiUrl}/api/v1/verification/drafts/${draftId}/preview`, { credentials: 'include' })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [draftId]);
  return url;
}

/** A QR code as an SVG, dark on white whatever the theme, so every phone camera reads it. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: 'M', border: 0 });
  const margin = 4;
  const cells: string[] = [];
  data.forEach((row, y) => row.forEach((dark, x) => dark && cells.push(`M${x + margin} ${y + margin}h1v1h-1z`)));
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size + margin * 2} ${size + margin * 2}`} className="size-56 rounded-[12px] bg-white" shapeRendering="crispEdges">
      <path d={cells.join('')} fill="#000" />
    </svg>
  );
}

/**
 * The computer's camera in a window: a live view and a button that takes the photo. Asks for the camera only when
 * opened, and turns it off again when closed.
 */
export function CameraDialog({ open, title, facing, onClose, onCapture }: { open: boolean; title: string; facing: 'user' | 'environment'; onClose: () => void; onCapture: (photo: Blob) => void }) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'ready' | 'failed'>('starting');
  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    setState('starting');
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((track) => track.stop());
        stream = s;
        if (video.current) video.current.srcObject = s;
        setState('ready');
      })
      .catch(() => setState('failed'));
    if (!navigator.mediaDevices) setState('failed');
    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, facing]);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    canvas.toBlob((blob) => blob && onCapture(blob), 'image/jpeg', 0.92);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('docs.camera.body')}</DialogDescription>
        </DialogHeader>
        {state === 'failed' ? (
          <Notice tone="warning">{t('docs.camera.unavailable')}</Notice>
        ) : (
          <div className="relative overflow-hidden rounded-[12px] bg-black">
            {/* A live camera view has no words to caption. */}
            <video ref={video} autoPlay playsInline muted className="aspect-video w-full object-contain" />
            {state === 'starting' && <p role="status" className="absolute inset-0 grid place-items-center text-sm text-white">{t('docs.camera.starting')}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={state !== 'ready'} onClick={capture}>
            {t('docs.camera.capture')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
