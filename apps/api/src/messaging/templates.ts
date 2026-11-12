// Message wording, in the reader's language: every sentence is a key in the `email` catalogue (packages/shared,
// see text.ts there), so the owner's reviewer corrects the Sinhala in the spreadsheet. D10: staff never ask for codes.
import type { Language } from '@fh/shared';
import { dateIn, text, type EmailTextKey } from '../text.ts';

export type CodePurpose = 'sign-in' | 'email-verification' | 'forget-password' | 'phone-verification' | 'invitation';

const subjects: Record<CodePurpose, EmailTextKey> = {
  'sign-in': 'email.subject.signIn',
  'email-verification': 'email.subject.emailVerification',
  'forget-password': 'email.subject.forgetPassword',
  'phone-verification': 'email.subject.phoneVerification',
  invitation: 'email.subject.invitationCode',
};

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function layout(language: Language, title: string, body: string): string {
  return `<!doctype html><html lang="${language}"><body style="margin:0;padding:32px;background:#f7f4ef;font-family:Arial,'Noto Sans Sinhala','Iskoola Pota',sans-serif;color:#191919">
<div style="max-width:480px;margin:auto;background:#fff;border-radius:16px;padding:32px">
<p style="margin:0 0 8px;font-size:14px;color:#6b6b6b">Favorite Hearts</p>
<h1 style="margin:0 0 24px;font-size:22px">${escape(title)}</h1>
${body}
</div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:0 0 24px"><a href="${escape(href)}" style="display:inline-block;background:#f2b64c;color:#302512;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">${escape(label)}</a></p>`;
const paragraphs = (lines: string[]) => lines.map((line) => `<p style="margin:0 0 16px">${escape(line)}</p>`).join('\n');
const small = (line: string) => `<p style="margin:0;font-size:14px;color:#6b6b6b">${escape(line)}</p>`;

/** A sign-in or invitation code. `minutes`: how long it lasts (sign-in codes by default). */
export function codeEmail(language: Language, purpose: CodePurpose | (string & {}), code: string, minutes?: number) {
  const say = (key: EmailTextKey) => text(language, key, minutes === undefined ? undefined : { codeMinutes: minutes });
  const subject = say(subjects[purpose as CodePurpose] ?? 'email.subject.code');
  const lines = [say('email.code.expires'), say('email.warning.thisCode'), say('email.code.ignore')];
  const textBody = `${say('email.code.intro')} ${code}\n\n${lines.join('\n\n')}`;
  const html = layout(
    language,
    subject,
    `<p style="margin:0 0 8px">${escape(say('email.code.intro'))}</p>
<p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:6px">${code}</p>
<p style="margin:0 0 16px">${escape(lines[0]!)}</p>
<p style="margin:0 0 16px;font-size:14px;color:#6b6b6b">${escape(lines[1]!)}</p>
${small(lines[2]!)}`,
  );
  return { subject, text: textBody, html };
}

/**
 * `appUrl`: the member app's address. The last line ("@host #code", the Web OTP format) lets Android offer to fill the
 * code in on that site by itself; iPhones read the code from the message without it.
 */
export function codeSms(language: Language, code: string, minutes?: number, appUrl?: string): string {
  const body = text(language, 'email.sms.code', { code, ...(minutes === undefined ? {} : { codeMinutes: minutes }) });
  return appUrl ? `${body}\n\n@${new URL(appUrl).hostname} #${code}` : body;
}

/** `managerName` null: the manager has not given a name yet. */
export type InvitationWording = { managerName: string | null; candidateName: string | null; link: string; hours: number };

/** OWNER-DECISIONS section 5: the link is single-use, lasts 24 hours and needs a code sent to this address. */
export function invitationEmail(language: Language, wording: InvitationWording) {
  const vars = {
    managerName: wording.managerName || text(language, 'email.invitation.someone'),
    candidateName: wording.candidateName ?? '',
    hours: wording.hours,
  };
  const subject = text(language, 'email.invitation.subject', vars);
  const lines = [
    text(language, wording.candidateName ? 'email.invitation.greetingNamed' : 'email.invitation.greeting', vars),
    text(language, 'email.invitation.prepared', vars),
    text(language, 'email.invitation.choices', vars),
    text(language, 'email.invitation.link', vars),
  ];
  const warning = text(language, 'email.warning.anyCode');
  const html = layout(language, subject, `${paragraphs(lines)}\n${button(wording.link, text(language, 'email.invitation.button'))}\n${small(warning)}`);
  return { subject, text: `${lines.join('\n\n')}\n\n${wording.link}\n\n${warning}`, html };
}

export function invitationSms(language: Language, wording: InvitationWording): string {
  return text(language, 'email.sms.invitation', {
    managerName: wording.managerName || text(language, 'email.invitation.someone'),
    hours: wording.hours,
    link: wording.link,
  });
}

// --- Plan, payment and profile notifications (OWNER-DECISIONS sections 3, 5, 8 and 9; queued in notification_outbox) ---

type Rendered = { subject: string; text: string; html: string };

function notice(language: Language, subject: string, lines: string[], appUrl: string): Rendered {
  const safety = text(language, 'email.warning.passwordOrCode');
  const plain = `${lines.join('\n\n')}\n\n${text(language, 'email.notice.textLink', { appUrl })}\n\n${safety}`;
  const html = layout(language, subject, `${paragraphs(lines)}\n${button(appUrl, text(language, 'email.notice.button'))}\n${small(safety)}`);
  return { subject, text: plain, html };
}

/** One email per outbox template, in the recipient's language; null for an unknown template (the sender marks it failed). */
export function notificationEmail(
  language: Language,
  template: string,
  payload: Record<string, unknown>,
  appUrl: string,
): Rendered | null {
  const str = (value: unknown, fallback: EmailTextKey) => (typeof value === 'string' && value.trim() ? value : text(language, fallback));
  const when = (value: unknown) => text(language, 'email.time.sriLanka', { time: dateIn(language, String(value), 'whenLong') });
  // Plan names are the owner's own words and member names are the members': both are shown as written.
  const vars = {
    plan: str(payload.planName, 'email.fallback.plan'),
    profile: str(payload.profileName, 'email.fallback.profile'),
    reference: typeof payload.reference === 'string' ? payload.reference : '',
    endsAt: payload.endsAt ? when(payload.endsAt) : '',
  };
  const say = (key: EmailTextKey, extra?: Record<string, string>) => text(language, key, { ...vars, ...extra });
  const send = (subject: EmailTextKey, lines: string[], subjectVars?: Record<string, string>) =>
    notice(language, say(subject, subjectVars), lines, appUrl);
  switch (template) {
    case 'payment_approved':
      return send('email.paymentApproved.subject', [say('email.paymentApproved.matched'), say('email.paymentApproved.unlocked')]);
    case 'payment_rejected':
      return send('email.paymentRejected.subject', [
        say('email.paymentRejected.notConfirmed'),
        say('email.paymentRejected.reason', { reason: str(payload.reason, 'email.paymentRejected.noReason') }),
        say('email.paymentRejected.next'),
      ]);
    case 'payment_held':
      return send('email.paymentHeld.subject', [
        say('email.paymentHeld.need'),
        str(payload.message, 'email.paymentHeld.noMessage'),
        say('email.paymentHeld.where'),
      ]);
    case 'payment_refunded':
      return send('email.paymentRefunded.subject', [
        say('email.paymentRefunded.refunded'),
        say(payload.planEnded === true ? 'email.paymentRefunded.planEnded' : 'email.paymentRefunded.planStays'),
      ]);
    case 'plan_expiring':
      return send(
        'email.planExpiring.subject',
        [
          say('email.planExpiring.ends'),
          say('email.planExpiring.afterwards'),
          say(payload.renewalPending === true ? 'email.renewalPending' : 'email.planExpiring.renew'),
        ],
        { date: dateIn(language, String(payload.endsAt), 'whenLong') },
      );
    case 'plan_ended':
      return send('email.planEnded.subject', [
        say('email.planEnded.ended'),
        say(payload.renewalPending === true ? 'email.renewalPending' : 'email.planEnded.hidden'),
      ]);
    case 'profile_handed_over':
      return send('email.handedOver.subject', [
        say(payload.managerDeleted === true ? 'email.handedOver.managerDeleted' : 'email.handedOver.handedOver'),
        say('email.handedOver.stays'),
        say(payload.paused === true ? 'email.handedOver.paused' : 'email.handedOver.check'),
      ]);
    case 'profile_deleted':
      return send('email.profileDeleted.subject', [say('email.profileDeleted.deleted'), say('email.profileDeleted.kept')]);
    default:
      return null;
  }
}

/**
 * Sign-up confirmation (owner decision, 11 Nov 2026): one email holds both the code and a button that confirms in one
 * step. The button opens the member app with the address and code after "#", so they never reach a server log.
 */
export function signUpEmail(language: Language, code: string, link: string) {
  const say = (key: EmailTextKey) => text(language, key);
  const subject = say('email.signUp.subject');
  const lines = [say('email.code.expires'), say('email.warning.thisCode'), say('email.signUp.ignore')];
  const html = layout(
    language,
    subject,
    `<p style="margin:0 0 8px">${escape(say('email.signUp.intro'))}</p>
<p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:6px">${code}</p>
<p style="margin:0 0 16px">${escape(say('email.signUp.link'))}</p>
${button(link, say('email.signUp.button'))}
<p style="margin:0 0 16px">${escape(lines[0]!)}</p>
<p style="margin:0 0 16px;font-size:14px;color:#6b6b6b">${escape(lines[1]!)}</p>
${small(lines[2]!)}`,
  );
  const textBody = `${say('email.signUp.intro')} ${code}\n\n${say('email.signUp.link')}\n${link}\n\n${lines.join('\n\n')}`;
  return { subject, text: textBody, html };
}

/** Someone signed up with an address that already has an account: its owner hears, the screen says nothing more. */
export function registeredEmail(language: Language, logInLink: string) {
  const say = (key: EmailTextKey) => text(language, key);
  const subject = say('email.registered.subject');
  const lines = [say('email.registered.body'), say('email.registered.action')];
  const ignore = say('email.registered.ignore');
  const html = layout(language, subject, `${paragraphs(lines)}\n${button(logInLink, say('email.registered.button'))}\n${small(ignore)}`);
  return { subject, text: `${lines.join('\n\n')}\n\n${logInLink}\n\n${ignore}`, html };
}

export const registeredSms = (language: Language) => text(language, 'email.sms.registered');

/** A password reset link (email accounts only; staff and phone-only accounts get none). */
export function resetEmail(language: Language, link: string) {
  const say = (key: EmailTextKey) => text(language, key);
  const subject = say('email.reset.subject');
  const intro = say('email.reset.intro');
  const lines = [say('email.reset.expires'), say('email.warning.resetLink'), say('email.reset.ignore')];
  const html = layout(
    language,
    subject,
    `${paragraphs([intro])}\n${button(link, say('email.reset.button'))}\n<p style="margin:0 0 16px">${escape(lines[0]!)}</p>
<p style="margin:0 0 16px;font-size:14px;color:#6b6b6b">${escape(lines[1]!)}</p>\n${small(lines[2]!)}`,
  );
  return { subject, text: `${intro}\n\n${link}\n\n${lines.join('\n\n')}`, html };
}

// --- Security alerts to the owner's mailbox (docs/ADMIN-PANEL-PLAN.md, layer 10). Staff texts stay in English. ---

const SECURITY_ALERT_TITLES: Record<string, string> = {
  new_device_sign_in: 'A staff account signed in from a new device',
  account_locked: 'A staff account is locked after wrong two-step codes',
  two_factor_changed: 'Two-step login was changed on a staff account',
  passkey_changed: 'A passkey was added to or removed from a staff account',
  backup_codes_regenerated: 'New backup codes were made for a staff account',
  password_changed: 'A staff password was changed',
  staff_invited: 'Someone was invited to the admin site',
  staff_joined: 'An invited staff member set up their account',
  staff_revoked: 'A staff member lost access to the admin site',
  staff_two_factor_reset: "A staff member's two-step login was reset",
  payment_details_changed: 'The payment details members pay into were changed',
};

/** One security alert, in English. Facts only: never a code, password, document or member contact detail. */
export function securityAlertEmail(payload: Record<string, unknown>, adminOrigin: string | null): Rendered {
  const title = SECURITY_ALERT_TITLES[String(payload.kind)] ?? 'Security alert';
  const staff = payload.staff as { name?: string; email?: string } | null;
  const details = (payload.details ?? {}) as Record<string, string>;
  const lines = [
    staff ? `Account: ${staff.name ?? ''} <${staff.email ?? ''}>` : null,
    `Time (UTC): ${String(payload.at ?? '')}`,
    ...Object.entries(details).map(([name, value]) => `${name}: ${value}`),
    'If this was not you or someone you expected, sign in to the admin site, end the sessions and reset the account (docs/ADMIN-RUNBOOK.md).',
  ].filter((line): line is string => Boolean(line));
  const link = adminOrigin ? `\n\nAdmin site: ${adminOrigin}` : '';
  const html = layout('en', title, `${paragraphs(lines)}${adminOrigin ? `\n${button(adminOrigin, 'Open the admin site')}` : ''}`);
  return { subject: `Favorite Hearts security: ${title}`, text: `${lines.join('\n\n')}${link}`, html };
}
