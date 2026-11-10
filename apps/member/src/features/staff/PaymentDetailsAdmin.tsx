/**
 * The owner's own payment details (OWNER-DECISIONS section 9: real ones only, never invented). Members see a
 * method only after it is switched on here. Members send real money to these details, so every change is
 * audited with the details before and after.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PaymentSettingView } from '@fh/shared';
import { CheckboxField, TextAreaField } from '@/components/form/fields';
import { Card, Loading, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { errorMessage, put } from '@/lib/api';
import { formatWhen } from '@/lib/format';
import { useOwnerSettings } from '@/lib/queries';
import { queryClient } from '@/lib/query-client';
import { ENGLISH_BILLING } from '@/features/billing/labels';

const { channelLabels } = ENGLISH_BILLING;

const examples: Record<PaymentSettingView['channel'], string> = {
  lkr_bank_transfer: 'Account name, bank, branch and account number.',
  usd_swift: 'Account name, bank, account number or IBAN, SWIFT/BIC code and bank address.',
  wise: 'The Wise account holder name, and the email or details members send to.',
  paypal: 'The PayPal email address or payment link.',
};

export function PaymentDetailsAdmin() {
  const settings = useOwnerSettings();
  return (
    <div className="m-surface m-staff-area">
      <h3>Payment details</h3>
      <p>Members pay into these details. They see only the methods you switch on, with the amount and their own reference.</p>
      <div className="mb-6">
        <Notice tone="warning" title="Check every character">
          Members send real money to what you enter here. Every change is logged with the old and new details.
        </Notice>
      </div>
      {settings.isPending ? (
        <Loading />
      ) : settings.isError ? (
        <Notice tone="error">{errorMessage(settings.error)}</Notice>
      ) : (
        <div className="flex flex-col gap-4">
          {settings.data.map((setting) => (
            <ChannelSetting key={setting.channel} setting={setting} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelSetting({ setting }: { setting: PaymentSettingView }) {
  const [instructions, setInstructions] = useState(setting.instructions ?? '');
  const [enabled, setEnabled] = useState(setting.enabled);
  const save = useMutation({
    mutationFn: () => put<PaymentSettingView>(`/owner/payment-settings/${setting.channel}`, { enabled, instructions: instructions.trim() || null }),
    onSuccess: async (saved) => {
      toast.success(saved.enabled ? `${channelLabels[saved.channel]} is shown to members.` : `${channelLabels[saved.channel]} is hidden from members.`);
      await queryClient.invalidateQueries({ queryKey: ['owner', 'settings'] });
    },
  });
  const changed = enabled !== setting.enabled || instructions.trim() !== (setting.instructions ?? '');
  const tooShort = enabled && instructions.trim().length < 10;
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="font-serif text-xl">{channelLabels[setting.channel]}</h2>
        <p className="text-sm font-semibold">
          {setting.currency} · {setting.enabled ? 'shown to members' : 'off'}
        </p>
      </div>
      {setting.updatedAt && <p className="mt-1 text-xs text-muted-foreground">Last changed {formatWhen(setting.updatedAt)}</p>}
      <div className="mt-4 flex flex-col gap-4">
        {save.isError && <Notice tone="error">{errorMessage(save.error)}</Notice>}
        <TextAreaField label="Details members pay into" hint={examples[setting.channel]} rows={4} maxLength={1500} value={instructions} onChange={setInstructions} />
        <CheckboxField checked={enabled} onChange={setEnabled} label={`Show ${channelLabels[setting.channel]} to members paying in ${setting.currency}`} error={tooShort ? 'Enter the details before switching this on.' : undefined} />
        <Button className="h-11 self-start" disabled={!changed || tooShort || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Card>
  );
}
