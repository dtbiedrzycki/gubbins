import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

// Route-level code-splitting: each page is its own chunk.
const CreateListPage = lazy(() => import('./pages/CreateListPage'));
const ListPage = lazy(() => import('./pages/ListPage'));
const ManagePage = lazy(() => import('./pages/ManagePage'));

const router = createBrowserRouter([
  { path: '/', element: <CreateListPage /> },
  { path: '/:slug', element: <ListPage /> },
  { path: '/:slug/manage', element: <ManagePage /> },
]);

export default function App() {
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
