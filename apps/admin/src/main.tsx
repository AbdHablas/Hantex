import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Shell } from './components/Shell';
import { ApiError } from './lib/api';
import { I18nProvider } from './lib/i18n';
import { ThemeProvider } from './lib/theme';
import { AcceptInvitation, Recover, SignIn } from './routes/auth';
import { Account, AuditLog, Home, Roles, SiteSettings, Sites } from './routes/platform';
import { ComingSoonEditor, SiteOverview, SitePage, Subscribers } from './routes/site';
import { PlatformStaff, SiteStaff } from './routes/staff';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Permission and validation errors won't change on retry.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createBrowserRouter([
  { path: '/sign-in', element: <SignIn /> },
  { path: '/accept-invitation', element: <AcceptInvitation /> },
  { path: '/recover', element: <Recover /> },
  {
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      {
        path: 's/:siteKey',
        children: [
          {
            index: true,
            element: (
              <SitePage>
                <SiteOverview />
              </SitePage>
            ),
          },
          {
            path: 'coming-soon',
            element: (
              <SitePage>
                <ComingSoonEditor />
              </SitePage>
            ),
          },
          {
            path: 'subscribers',
            element: (
              <SitePage>
                <Subscribers />
              </SitePage>
            ),
          },
          {
            path: 'staff',
            element: (
              <SitePage>
                <SiteStaff />
              </SitePage>
            ),
          },
          {
            path: 'audit',
            element: (
              <SitePage>
                <AuditLog scope="site" />
              </SitePage>
            ),
          },
          {
            path: 'settings',
            element: (
              <SitePage>
                <SiteSettings />
              </SitePage>
            ),
          },
        ],
      },
      { path: 'sites', element: <Sites /> },
      { path: 'staff', element: <PlatformStaff /> },
      { path: 'roles', element: <Roles /> },
      { path: 'audit', element: <AuditLog scope="platform" /> },
      { path: 'account', element: <Account /> },
      { path: '*', element: <Home /> },
    ],
  },
]);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <ThemeProvider>
            <RouterProvider router={router} />
          </ThemeProvider>
        </I18nProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
