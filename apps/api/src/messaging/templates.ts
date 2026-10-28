// Code message wording. English now; Sinhala added with the copy export in Stage 5
// (reviewed by a native speaker before launch). D10: staff never ask for codes.

export type CodePurpose = 'sign-in' | 'email-verification' | 'forget-password' | 'phone-verification';

const subjects: Record<CodePurpose, string> = {
  'sign-in': 'Your Favorite Hearts sign-in code',
  'email-verification': 'Confirm your email — Favorite Hearts',
  'forget-password': 'Your Favorite Hearts account recovery code',
  'phone-verification': 'Your Favorite Hearts code',
};

const WARNING = 'Favorite Hearts staff will never ask you for this code. Do not share it with anyone.';

export function codeEmail(purpose: CodePurpose | (string & {}), code: string, minutes: number) {
  const subject = subjects[purpose as CodePurpose] ?? 'Your Favorite Hearts code';
  const text = `Your code is ${code}\n\nIt expires in ${minutes} minutes.\n\n${WARNING}\n\nIf you did not request this, you can ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;padding:32px;background:#f7f4ef;font-family:Arial,sans-serif;color:#191919">
<div style="max-width:480px;margin:auto;background:#fff;border-radius:16px;padding:32px">
<p style="margin:0 0 8px;font-size:14px;color:#6b6b6b">Favorite Hearts</p>
<h1 style="margin:0 0 24px;font-size:22px">${subject}</h1>
<p style="margin:0 0 8px">Your code is</p>
<p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:6px">${code}</p>
<p style="margin:0 0 16px">It expires in ${minutes} minutes.</p>
<p style="margin:0 0 16px;font-size:14px;color:#6b6b6b">${WARNING}</p>
<p style="margin:0;font-size:14px;color:#6b6b6b">If you did not request this, you can ignore this email.</p>
</div></body></html>`;
  return { subject, text, html };
}

export function codeSms(code: string, minutes: number): string {
  return `Favorite Hearts code: ${code}. Expires in ${minutes} min. Never share it - our staff will never ask for it.`;
}
