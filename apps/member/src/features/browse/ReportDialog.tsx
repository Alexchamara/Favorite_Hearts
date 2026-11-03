/**
 * Reporting a profile or one photo (OWNER-DECISIONS section 7). The reporter learns only that it was received;
 * staff review every report, and false reports have consequences.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { REPORT_CATEGORIES } from '@fh/shared';
import { SelectField, TextAreaField } from '@/components/form/fields';
import { Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { errorMessage, post } from '@/lib/api';
import { useLabels } from '@/features/profile/options';
import { say, useI18n } from '@/lib/i18n';

type Category = (typeof REPORT_CATEGORIES)[number];

export function ReportDialog({
  trigger,
  reporterProfileId,
  profileId,
  photoId,
  name,
}: {
  trigger: ReactNode;
  reporterProfileId: string;
  profileId: string;
  photoId?: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category | ''>('');
  const [detail, setDetail] = useState('');
  const { t } = useI18n();
  const { reportCategoryLabels } = useLabels();
  const report = useMutation({
    mutationFn: () => post('/reports', { reporterProfileId, profileId, ...(photoId ? { photoId } : {}), category, ...(detail.trim() ? { detail } : {}) }),
    onSuccess: () => {
      toast.success(say('report.thanks'));
      setOpen(false);
      setCategory('');
      setDetail('');
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    report.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{photoId ? t('report.photoTitle') : t('report.profileTitle', { name })}</DialogTitle>
            <DialogDescription>{t(photoId ? 'report.photoBody' : 'report.profileBody', { name })}</DialogDescription>
          </DialogHeader>
          {report.isError && <Notice tone="error">{errorMessage(report.error)}</Notice>}
          <SelectField label={t('report.reason')} value={category} onChange={setCategory} options={REPORT_CATEGORIES.map((value) => ({ value, label: reportCategoryLabels[value] }))} />
          <TextAreaField label={t('report.detail')} rows={4} maxLength={1000} value={detail} onChange={setDetail} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!category || report.isPending}>
              {report.isPending ? t('signIn.sending') : t('report.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
