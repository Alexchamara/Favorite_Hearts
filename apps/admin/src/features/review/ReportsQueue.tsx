/**
 * Report review (OWNER-DECISIONS section 7). Serious reports hide content at once and others after 3 different
 * verified members, so hidden content is listed first: staff restore what was hidden wrongly. Each reporter's
 * earlier dismissed reports are shown, so repeated false reporting is visible. Looking is logged.
 */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { REPORT_STATUSES, type StaffReportContent, type StaffReportItem } from '@fh/shared';
import { TextAreaField } from '@/components/form/fields';
import { Flag } from 'lucide-react';
import { Loading, Notice } from '@admin/components/shell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errorMessage, post } from '@admin/lib/api';
import { formatWhen } from '@/lib/format';
import { keys } from '@admin/lib/queries';
import { queryClient } from '@admin/lib/query-client';
import { ENGLISH_LABELS } from '@/features/profile/options';
import { englishPlaceOf as placeOf, PhotoFrame } from '@/features/browse/MemberCard';
import { Empty } from './Empty';

const { reportCategoryLabels } = ENGLISH_LABELS;

const statusNames: Record<(typeof REPORT_STATUSES)[number], string> = { open: 'Open', upheld: 'Upheld', dismissed: 'Dismissed' };

export function useStaffReports(status: (typeof REPORT_STATUSES)[number]) {
  return useQuery({
    queryKey: keys.staffReports(status),
    queryFn: async () => (await api<{ reports: StaffReportItem[] }>(`/staff/reports?status=${status}`)).reports,
  });
}

const targetName = (item: StaffReportItem) => `${item.target.displayName ?? 'Deleted profile'}${item.target.photoId ? ' · a photo' : ''}`;

/** The demo's safety reports list: one .m-request-row per report; the report opens in a dialog. */
export function ReportsQueue() {
  const [status, setStatus] = useState<(typeof REPORT_STATUSES)[number]>('open');
  const [selected, setSelected] = useState<string | null>(null);
  const queue = useStaffReports(status);
  const current = queue.data?.find((item) => item.id === selected) ?? null;
  return (
    <div className="m-surface">
      <h3>Safety reports</h3>
      <p>
        Serious reports hide the content at once; others after three different verified members. Restore anything hidden
        wrongly.
      </p>
      <Tabs value={status} onValueChange={(value) => { setStatus(value as typeof status); setSelected(null); }} className="m-tabs">
        <TabsList aria-label="Show reports">
          {REPORT_STATUSES.map((value) => (
            <TabsTrigger key={value} value={value}>
              {statusNames[value]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {queue.isPending ? (
        <Loading />
      ) : queue.isError ? (
        <Notice tone="error">{errorMessage(queue.error)}</Notice>
      ) : queue.data.length === 0 ? (
        <Empty title={status === 'open' ? 'No reports to review.' : 'Nothing here.'} text="Private reports from members appear here." />
      ) : (
        queue.data.map((item) => (
          <div className="m-request-row" key={item.id}>
            <Flag size={19} aria-hidden="true" />
            <div>
              <strong>{targetName(item)}</strong>
              <p>{reportCategoryLabels[item.category]}</p>
              <small>{formatWhen(item.createdAt)}</small>
            </div>
            <span className="m-tag">{item.target.hidden ? 'Hidden now' : statusNames[item.status]}</span>
            <button type="button" className="m-btn m-secondary" onClick={() => setSelected(item.id)}>
              {item.status === 'open' ? 'Review' : 'Open'}
            </button>
          </div>
        ))
      )}
      <Dialog open={!!current} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent>
          {current && (
            <>
              <DialogHeader>
                <span className="m-kicker uppercase">Report review</span>
                <DialogTitle>{reportCategoryLabels[current.category]}</DialogTitle>
                <DialogDescription>
                  {targetName(current)} · {formatWhen(current.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <ReportDetail key={current.id} item={current} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportDetail({ item }: { item: StaffReportItem }) {
  const [note, setNote] = useState('');
  const [content, setContent] = useState<StaffReportContent | null>(null);
  const show = useMutation({
    mutationFn: () => api<StaffReportContent>(`/staff/reports/${item.id}/content`),
    onSuccess: setContent,
  });
  const decide = useMutation({
    mutationFn: (decision: 'upheld' | 'dismissed') => post<{ contentHidden: boolean }>(`/staff/reports/${item.id}/decision`, { decision, ...(note.trim() ? { note } : {}) }),
    onSuccess: async (result, decision) => {
      toast.success(
        decision === 'upheld'
          ? 'Upheld. The content stays hidden.'
          : result.contentHidden
            ? 'Dismissed. Other open reports still keep it hidden.'
            : 'Dismissed. The content is visible again.',
      );
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
  });
  return (
    <div>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="inline font-semibold">Reported: </dt>
          <dd className="inline">
            {item.target.displayName ?? 'Deleted profile'}
            {item.target.photoId ? ' (one photo)' : ' (the profile)'}, {item.target.hidden ? 'hidden now' : 'visible'}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold">By: </dt>
          <dd className="inline">
            {item.reporter.displayName ?? 'A deleted profile'}
            {item.reporter.dismissedBefore > 0 && ` (${item.reporter.dismissedBefore} earlier report${item.reporter.dismissedBefore === 1 ? '' : 's'} dismissed)`}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold">What happened: </dt>
          <dd className="inline">{item.detail ?? 'No details given.'}</dd>
        </div>
      </dl>
      <div className="mt-5">
        {content ? (
          <ReportedContent content={content} />
        ) : (
          <Button variant="outline" className="h-11" disabled={show.isPending} onClick={() => show.mutate()}>
            Show the reported content (logged)
          </Button>
        )}
        {show.isError && <Notice tone="error">{errorMessage(show.error)}</Notice>}
      </div>
      {item.status === 'open' ? (
        <div className="mt-6 flex flex-col gap-4">
          {decide.isError && <Notice tone="error">{errorMessage(decide.error)}</Notice>}
          <TextAreaField label="Note for the record (optional; never shown to members)" rows={3} maxLength={1000} value={note} onChange={setNote} />
          <div className="flex flex-wrap gap-3">
            <Button className="h-11" disabled={decide.isPending} onClick={() => decide.mutate('upheld')}>
              Uphold: keep it hidden
            </Button>
            <Button variant="outline" className="h-11" disabled={decide.isPending} onClick={() => decide.mutate('dismissed')}>
              Dismiss: show it again
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm">{item.status === 'upheld' ? 'Upheld.' : 'Dismissed.'}</p>
      )}
    </div>
  );
}

function ReportedContent({ content }: { content: StaffReportContent }) {
  const { profile } = content;
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border p-4 text-sm">
      <p className="font-semibold">
        {profile.displayName ?? 'Member'}
        {profile.age !== null && `, ${profile.age}`} · {[profile.occupation, placeOf(profile)].filter(Boolean).join(' · ')}
      </p>
      {profile.bio && <p className="whitespace-pre-line">{profile.bio}</p>}
      {profile.family.familyStory && <p className="whitespace-pre-line text-muted-foreground">{profile.family.familyStory}</p>}
      {profile.photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {profile.photos.map((photo) => (
            <li key={photo.id} className={photo.id === content.reportedPhotoId ? 'rounded-[10px] outline-2 outline-offset-2 outline-destructive' : undefined}>
              <PhotoFrame photo={photo} name={profile.displayName} className="rounded-[10px]" />
              {photo.id === content.reportedPhotoId && <p className="mt-1 text-xs font-semibold text-destructive">Reported photo</p>}
              {photo.hidden && <p className="text-xs text-muted-foreground">Hidden from members</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
