import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { Footer } from './features/instance/Footer';

// Route-level code-splitting: each page is its own chunk.
const HomePage = lazy(() => import('./pages/HomePage'));
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
      { path: '/', element: <HomePage /> },
      { path: '/wishlists', element: <Navigate replace to="/wishlists/new" /> },
      { path: '/wishlists/new', element: <CreateListPage /> },
      { path: '/wishlists/:slug', element: <ListPage /> },
      { path: '/wishlists/:slug/manage', element: <ManagePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
