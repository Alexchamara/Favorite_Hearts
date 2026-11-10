import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, type Location } from 'react-router';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell, Loading, Notice, PageTitle } from '@/components/layout';
import { Toaster } from '@/components/ui/sonner';
import { EnglishOnly, useI18n } from '@/lib/i18n';
import { useMe } from '@/lib/queries';
import Home from '@/features/home/Home';

const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const NewProfilePage = lazy(() => import('@/features/profile/NewProfilePage'));
const BrowsePage = lazy(() => import('@/features/browse/BrowsePage'));
const MemberPage = lazy(() => import('@/features/browse/MemberPage'));
const MemberSheet = lazy(() => import('@/features/browse/MemberPage').then((module) => ({ default: module.MemberSheet })));
const VerifyPage = lazy(() => import('@/features/trust/VerifyPage'));
const PhoneUploadPage = lazy(() => import('@/features/trust/PhoneUploadPage'));
const InvitePage = lazy(() => import('@/features/invite/InvitePage'));
const StaffApp = lazy(() => import('@/features/staff/StaffApp'));
const RelationsPage = lazy(() => import('@/features/requests/RelationsPage'));
const ShortlistPage = lazy(() => import('@/features/browse/ShortlistPage'));

/** Member-only screens: signed-out visitors go to sign-in, staff to the staff workspace. */
function MemberOnly({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isPending) return <AppShell><Loading /></AppShell>;
  if (!me.data) return <Navigate to="/" replace />;
  if (me.data.staffRole) return <Navigate to="/staff" replace />;
  return children;
}

export default function App() {
  const location = useLocation();
  // A member's profile opened from a list arrives with that list as its background (state.background): the list stays
  // on screen and the profile opens over it as the demo's side sheet (SCREEN-055). From its own address it is a page.
  const background = (location.state as { background?: Location } | null)?.background;
  const { pathname } = background ?? location;
  const { t, rich } = useI18n();
  return (
    <>
      <Toaster position="top-center" containerAriaLabel={t('common.notifications')} />
      <ErrorBoundary key={pathname}>
        <Suspense fallback={<AppShell><Loading /></AppShell>}>
          <Routes location={background ?? location}>
            <Route path="/" element={<Home />} />
            <Route path="/profiles/new" element={<MemberOnly><NewProfilePage /></MemberOnly>} />
            <Route path="/profiles/:id/:section?" element={<MemberOnly><ProfilePage /></MemberOnly>} />
            <Route path="/verify" element={<MemberOnly><VerifyPage /></MemberOnly>} />
            {/* A document QR code's page on a phone: its link token, not a session (no sign-in). */}
            <Route path="/verify/phone" element={<PhoneUploadPage />} />
            <Route path="/browse" element={<MemberOnly><BrowsePage /></MemberOnly>} />
            <Route path="/members/:id" element={<MemberOnly><MemberPage /></MemberOnly>} />
            <Route path="/requests" element={<MemberOnly><RelationsPage kind="requests" /></MemberOnly>} />
            <Route path="/connections" element={<MemberOnly><RelationsPage kind="connections" /></MemberOnly>} />
            <Route path="/shortlist" element={<MemberOnly><ShortlistPage /></MemberOnly>} />
            <Route path="/invite" element={<InvitePage />} />
            <Route
              path="/staff"
              element={
                <EnglishOnly>
                  <StaffApp />
                </EnglishOnly>
              }
            />
            <Route
              path="*"
              element={
                <AppShell>
                  <PageTitle title={t('notFound.title')} />
                  <Notice>
                    {rich('notFound.body', {
                      link: (words) => (
                        <a className="underline" href="/app/">
                          {words}
                        </a>
                      ),
                    })}
                  </Notice>
                </AppShell>
              }
            />
          </Routes>
          {background && (
            <Routes>
              <Route path="/members/:id" element={<MemberOnly><MemberSheet /></MemberOnly>} />
            </Routes>
          )}
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
