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
