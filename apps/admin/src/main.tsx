import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Shell } from './components/Shell';
import { ApiError } from './lib/api';
import { I18nProvider } from './lib/i18n';
import { ThemeProvider } from './lib/theme';
import { AcceptInvitation, Recover, SignIn } from './routes/auth';
import { Account, AuditLog, Home, Roles, SiteSettings, Sites } from './routes/platform';
import { AppearanceEditor, SiteSettingsEditor } from './routes/editors';
import { ComingSoonEditor, SitePage, Subscribers } from './routes/site';
import { PlatformStaff, SiteStaff } from './routes/staff';
import { Loading } from './components/ui';
import './styles.css';

// The overview's charts are the largest dependency; they load only when the page is opened.
const SiteOverview = lazy(() =>
  import('./routes/overview').then((module) => ({ default: module.SiteOverview })),
);
// So is the website builder (rich-text editor, drag and drop).
const PagesList = lazy(() =>
  import('./routes/pages').then((module) => ({ default: module.PagesList })),
);
const PageEditor = lazy(() =>
  import('./routes/pages').then((module) => ({ default: module.PageEditor })),
);
const MediaLibrary = lazy(() =>
  import('./routes/media').then((module) => ({ default: module.MediaLibrary })),
);
const MenusEditor = lazy(() =>
  import('./routes/menus').then((module) => ({ default: module.MenusEditor })),
);
const FontLibrary = lazy(() =>
  import('./routes/fonts').then((module) => ({ default: module.FontLibrary })),
);
const LogoEditor = lazy(() =>
  import('./routes/logo').then((module) => ({ default: module.LogoEditor })),
);

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
                <Suspense fallback={<Loading />}>
                  <SiteOverview />
                </Suspense>
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
            path: 'pages',
            element: (
              <SitePage>
                <Suspense fallback={<Loading />}>
                  <PagesList />
                </Suspense>
              </SitePage>
            ),
          },
          {
            path: 'pages/:pageId',
            element: (
              <SitePage>
                <Suspense fallback={<Loading />}>
                  <PageEditor />
                </Suspense>
              </SitePage>
            ),
          },
          {
            path: 'media',
            element: (
              <SitePage>
                <Suspense fallback={<Loading />}>
                  <MediaLibrary />
                </Suspense>
              </SitePage>
            ),
          },
          {
            path: 'menus',
            element: (
              <SitePage>
                <Suspense fallback={<Loading />}>
                  <MenusEditor />
                </Suspense>
              </SitePage>
            ),
          },
          {
            path: 'site-settings',
            element: (
              <SitePage>
                <SiteSettingsEditor />
              </SitePage>
            ),
          },
          {
            path: 'appearance',
            element: (
              <SitePage>
                <AppearanceEditor />
              </SitePage>
            ),
          },
          {
            path: 'logo',
            element: (
              <SitePage>
                <Suspense fallback={<Loading />}>
                  <LogoEditor />
                </Suspense>
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
      {
        path: 'fonts',
        element: (
          <Suspense fallback={<Loading />}>
            <FontLibrary />
          </Suspense>
        ),
      },
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
