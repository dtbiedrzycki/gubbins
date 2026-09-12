import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

// Route-level code-splitting, established now with two routes so the
// pattern is already in place when more pages (owner dashboard, etc.)
// land in later sub-projects.
const CreateListPage = lazy(() => import('./pages/CreateListPage'));
const ListPage = lazy(() => import('./pages/ListPage'));

const router = createBrowserRouter([
  { path: '/', element: <CreateListPage /> },
  { path: '/:slug', element: <ListPage /> },
]);

export default function App() {
  return (
    <Suspense fallback={<p className="p-6">Loading…</p>}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
