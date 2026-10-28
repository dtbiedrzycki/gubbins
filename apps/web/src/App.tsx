import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';
import { Footer } from './features/instance/Footer';

// Route-level code-splitting: each page is its own chunk.
const CreateListPage = lazy(() => import('./pages/CreateListPage'));
const ListPage = lazy(() => import('./pages/ListPage'));
const ManagePage = lazy(() => import('./pages/ManagePage'));

// Pages render their own <main>; the layout route puts the footer after it on every page,
// and suspends only the page so the footer stays while a page chunk loads.
function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <Suspense fallback={<p className="p-6">Loading…</p>}>
        <Outlet />
      </Suspense>
      <Footer />
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <CreateListPage /> },
      { path: '/:slug', element: <ListPage /> },
      { path: '/:slug/manage', element: <ManagePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
