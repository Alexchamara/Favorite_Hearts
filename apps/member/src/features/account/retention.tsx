/**
 * What deleting removes at once and what is kept, and for how long (OWNER-DECISIONS section 8), said the same way for an
 * account and for one profile. Deleting needs a recent sign-in: RecentSignInNotice signs out and back to sign-in.
 */
import { useNavigate } from 'react-router';
import { RECENT_SIGN_IN_MINUTES } from '@fh/shared';
import { Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { resetSession } from '@/lib/queries';

export function RetentionList({ months, account = false }: { months: number; account?: boolean }) {
  return (
    <>
      <section>
        <h3 className="font-semibold text-foreground">Deleted now</h3>
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          {account && <li>Your name, sign-in email and phone number. You are signed out everywhere.</li>}
          <li>Profile details, photos, contact details and social handles.</li>
          <li>Requests, connections and shortlists. Details already shared with connections cannot be taken back.</li>
          {account && <li>Your identity document. Only the review decision is kept, as below.</li>}
        </ul>
      </section>
      <section>
        <h3 className="font-semibold text-foreground">Kept for {months} months, then deleted</h3>
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          <li>Payment records and receipts.</li>
          <li>Reports and blocks.</li>
          <li>Our staff’s record of what they did{account ? ', including the review of your document' : ''}.</li>
          {account && <li>A scrambled form of your email and phone number, used only to stop banned accounts joining again.</li>}
        </ul>
      </section>
    </>
  );
}

export function RecentSignInNotice() {
  const navigate = useNavigate();
  const signInAgain = async () => {
    await authClient.signOut();
    await resetSession();
    navigate('/', { replace: true });
  };
  return (
    <Notice tone="warning" title="Please sign in again first">
      <p>For your safety, deleting is possible for {RECENT_SIGN_IN_MINUTES} minutes after you sign in.</p>
      <Button variant="outline" className="mt-3 h-10" onClick={() => void signInAgain()}>
        Sign out and sign in again
      </Button>
    </Notice>
  );
}
