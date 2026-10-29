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
import { reportCategoryLabels } from '@/features/profile/options';

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
  const report = useMutation({
    mutationFn: () => post('/reports', { reporterProfileId, profileId, ...(photoId ? { photoId } : {}), category, ...(detail.trim() ? { detail } : {}) }),
    onSuccess: () => {
      toast.success('Thank you. Our staff will review it.');
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
            <DialogTitle>{photoId ? 'Report this photo' : `Report ${name}`}</DialogTitle>
            <DialogDescription>
              Our staff review every report. Serious reports hide the {photoId ? 'photo' : 'profile'} straight away while they
              look. {name} is not told who reported.
            </DialogDescription>
          </DialogHeader>
          {report.isError && <Notice tone="error">{errorMessage(report.error)}</Notice>}
          <SelectField label="Reason" value={category} onChange={setCategory} options={REPORT_CATEGORIES.map((value) => ({ value, label: reportCategoryLabels[value] }))} />
          <TextAreaField label="What happened (optional)" rows={4} maxLength={1000} value={detail} onChange={setDetail} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!category || report.isPending}>
              {report.isPending ? 'Sending…' : 'Send report'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
