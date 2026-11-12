/**
 * The admin site (docs/ADMIN-PANEL-PLAN.md). What shows follows the server's answer to GET /api/admin/me: signed out →
 * sign-in; an invitation's setup session → finish setting up; signed in → the workspace for the role. The server
 * decides every request on its own whatever these screens show.
 */
import type { ReactNode } from 'react';
import { Link, Route, Routes } from 'react-router';
import { ToastLayer } from '@/components/toast-host';
import { Button } from '@/components/ui/button';
import { AdminShell, Loading, Notice, PageTitle } from './components/shell';
import { InvitePage } from './features/enrol/InvitePage';
import { StaffWorkspace } from './features/review/Workspace';
import { SecurityPage } from './features/security/SecurityPage';
import { SignIn } from './features/sign-in/SignIn';
import { errorMessage } from './lib/api';
import { authClient } from './lib/auth-client';
import { resetSession, useMe } from './lib/queries';
import { StepUpProvider } from './lib/step-up';

function SignedIn({ children }: { children: (role: 'owner' | 'backup_reviewer') => ReactNode }) {
  const me = useMe();
  if (me.isPending) return <Loading />;
  if (me.isError) return <Notice tone="error">{errorMessage(me.error)}</Notice>;
  if (!me.data) return <SignIn />;
  if (me.data.enrolment) {
    return (
      <>
        <PageTitle kicker="Admin invitation" title="Finish setting up first" />
        <Notice>Your setup session can only set up two-step login. Open your invitation link again, or sign out and sign in once it is set up.</Notice>
        <Button
          variant="outline"
          className="mt-4 h-11"
          onClick={async () => {
            await authClient.signOut();
            await resetSession();
          }}
        >
          Sign out
        </Button>
      </>
    );
  }
  return children(me.data.role);
}

export default function App() {
  return (
    <StepUpProvider>
      <ToastLayer position="top-center" containerAriaLabel="Notifications" />
      <Routes>
        <Route path="/" element={<AdminShell><SignedIn>{(role) => <StaffWorkspace role={role} />}</SignedIn></AdminShell>} />
        <Route path="/security" element={<AdminShell width="narrow"><SignedIn>{() => <SecurityPage />}</SignedIn></AdminShell>} />
        <Route path="/invite" element={<AdminShell width="narrow"><InvitePage /></AdminShell>} />
        <Route
          path="*"
          element={
            <AdminShell width="narrow">
              <PageTitle title="Not found" />
              <Link className="underline" to="/">
                Back to the workspace
              </Link>
            </AdminShell>
          }
        />
      </Routes>
    </StepUpProvider>
  );
}
