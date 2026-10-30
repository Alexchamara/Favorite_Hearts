// Message wording. English now; Sinhala added with the copy export in Stage 5
// (reviewed by a native speaker before launch). D10: staff never ask for codes.

export type CodePurpose = 'sign-in' | 'email-verification' | 'forget-password' | 'phone-verification' | 'invitation';

const subjects: Record<CodePurpose, string> = {
  'sign-in': 'Your Favorite Hearts sign-in code',
  'email-verification': 'Confirm your email — Favorite Hearts',
  'forget-password': 'Your Favorite Hearts account recovery code',
  'phone-verification': 'Your Favorite Hearts code',
  invitation: 'Your Favorite Hearts invitation code',
};

const WARNING = 'Favorite Hearts staff will never ask you for this code. Do not share it with anyone.';

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:32px;background:#f7f4ef;font-family:Arial,sans-serif;color:#191919">
<div style="max-width:480px;margin:auto;background:#fff;border-radius:16px;padding:32px">
<p style="margin:0 0 8px;font-size:14px;color:#6b6b6b">Favorite Hearts</p>
<h1 style="margin:0 0 24px;font-size:22px">${escape(title)}</h1>
${body}
</div></body></html>`;
}

export function codeEmail(purpose: CodePurpose | (string & {}), code: string, minutes: number) {
  const subject = subjects[purpose as CodePurpose] ?? 'Your Favorite Hearts code';
  const text = `Your code is ${code}\n\nIt expires in ${minutes} minutes.\n\n${WARNING}\n\nIf you did not request this, you can ignore this email.`;
  const html = layout(
    subject,
    `<p style="margin:0 0 8px">Your code is</p>
<p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:6px">${code}</p>
<p style="margin:0 0 16px">It expires in ${minutes} minutes.</p>
<p style="margin:0 0 16px;font-size:14px;color:#6b6b6b">${WARNING}</p>
<p style="margin:0;font-size:14px;color:#6b6b6b">If you did not request this, you can ignore this email.</p>`,
  );
  return { subject, text, html };
}

export function codeSms(code: string, minutes: number): string {
  return `Favorite Hearts code: ${code}. Expires in ${minutes} min. Never share it - our staff will never ask for it.`;
}

export type InvitationWording = { managerName: string; candidateName: string | null; link: string; hours: number };

/** OWNER-DECISIONS section 5: the link is single-use, lasts 24 hours and needs a code sent to this address. */
export function invitationEmail({ managerName, candidateName, link, hours }: InvitationWording) {
  const greeting = candidateName ? `Hello ${candidateName},` : 'Hello,';
  const subject = `${managerName} has started a Favorite Hearts matrimony profile for you`;
  const lines = [
    greeting,
    `${managerName} has prepared a matrimony profile for you on Favorite Hearts and would like you to review it.`,
    'You can accept and confirm it, decline it, or take it over and manage it yourself. Nothing is decided without you.',
    `The link works once and expires in ${hours} hours. When you open it we will send a code to this address to confirm it is you.`,
  ];
  const text = `${lines.join('\n\n')}\n\n${link}\n\n${WARNING.replace('this code', 'any code')}`;
  const html = layout(
    subject,
    `${lines.map((line) => `<p style="margin:0 0 16px">${escape(line)}</p>`).join('\n')}
<p style="margin:0 0 24px"><a href="${escape(link)}" style="display:inline-block;background:#f2b64c;color:#302512;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">Review the profile</a></p>
<p style="margin:0;font-size:14px;color:#6b6b6b">${escape(WARNING.replace('this code', 'any code'))}</p>`,
  );
  return { subject, text, html };
}

export function invitationSms({ managerName, link, hours }: InvitationWording): string {
  return `${managerName} started a Favorite Hearts matrimony profile for you. Review, accept or decline within ${hours}h: ${link}`;
}

// --- Plan, payment and profile notifications (OWNER-DECISIONS sections 3, 5, 8 and 9; queued in notification_outbox) ---

const sriLankaTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Colombo' });
const when = (value: unknown) => `${sriLankaTime.format(new Date(String(value)))} (Sri Lanka time)`;
const str = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value : fallback);

type Rendered = { subject: string; text: string; html: string };

function notice(subject: string, lines: string[], appUrl: string): Rendered {
  const safety = 'Favorite Hearts staff will never ask you for a password or a code.';
  const text = `${lines.join('\n\n')}\n\nOpen Favorite Hearts: ${appUrl}\n\n${safety}`;
  const html = layout(
    subject,
    `${lines.map((line) => `<p style="margin:0 0 16px">${escape(line)}</p>`).join('\n')}
<p style="margin:0 0 24px"><a href="${escape(appUrl)}" style="display:inline-block;background:#f2b64c;color:#302512;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">Open Favorite Hearts</a></p>
<p style="margin:0;font-size:14px;color:#6b6b6b">${safety}</p>`,
  );
  return { subject, text, html };
}

/** One email per outbox template; null for an unknown template (the sender marks it failed). */
export function notificationEmail(template: string, payload: Record<string, unknown>, appUrl: string): Rendered | null {
  const plan = str(payload.planName, 'Your plan');
  const profile = str(payload.profileName, 'your profile');
  const reference = str(payload.reference, '');
  const renewalPending = 'We have your renewal payment and are checking it. Access continues for up to 3 days after the end while we do.';
  switch (template) {
    case 'payment_approved':
      return notice('Your plan is active', [
        `We matched your payment ${reference} in our account. ${plan} is now active for ${profile} until ${when(payload.endsAt)}.`,
        'You can now send requests, see who sent you interest, and accept requests.',
      ], appUrl);
    case 'payment_rejected':
      return notice('We could not confirm your payment', [
        `We could not confirm payment ${reference} for ${plan}.`,
        `Reason: ${str(payload.reason, 'not given')}`,
        'You can start a new payment from the plan page of the profile. If you think this is a mistake, reply to this email.',
      ], appUrl);
    case 'payment_held':
      return notice('We need something more for your payment', [
        `Before we can confirm payment ${reference} for ${plan}, we need the following:`,
        str(payload.message, 'Please contact us.'),
        'Add it on the plan page of the profile.',
      ], appUrl);
    case 'payment_refunded':
      return notice('Your payment was refunded', [
        `Payment ${reference} for ${plan} was refunded.`,
        payload.planEnded === true ? 'The plan it paid for has ended.' : 'Your current plan stays active.',
      ], appUrl);
    case 'plan_expiring':
      return notice(`Your plan ends on ${sriLankaTime.format(new Date(String(payload.endsAt)))}`, [
        `${plan} for ${profile} ends on ${when(payload.endsAt)}.`,
        'After that you will no longer see the contact details or social handles of anyone, including your connections. Your connections stay, and their details come back when you renew.',
        payload.renewalPending === true ? renewalPending : 'You can renew the same plan in its last 7 days, or upgrade at any time.',
      ], appUrl);
    case 'plan_ended':
      return notice('Your plan has ended', [
        `${plan} for ${profile} ended on ${when(payload.endsAt)}.`,
        payload.renewalPending === true
          ? renewalPending
          : 'Contact details and social handles are now hidden, including those of your connections. Your connections stay, and their details come back when you renew.',
      ], appUrl);
    case 'profile_handed_over':
      return notice('You now run your profile yourself', [
        payload.managerDeleted === true
          ? `The family member who managed ${profile} deleted their account, so the profile is now yours to run.`
          : `The family member who managed ${profile} handed it over to you. You run it yourself from now on.`,
        'Its plan, requests and connections stay with the profile. Their contact details were removed from it.',
        payload.paused === true
          ? 'It is paused until your own identity document is reviewed and your phone is verified. Then you can publish it again.'
          : 'Check the profile details and your privacy settings when you next sign in.',
      ], appUrl);
    case 'profile_deleted':
      return notice('A profile you managed was deleted', [
        `The candidate deleted ${profile}, the profile you managed for them. It is no longer shown to anyone, and you no longer have access to it.`,
        'Some records, such as payments, are kept for a limited time, as our privacy policy explains.',
      ], appUrl);
    default:
      return null;
  }
}
