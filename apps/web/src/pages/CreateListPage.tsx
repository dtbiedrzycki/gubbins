import { CreateListForm } from '../features/create-list/CreateListForm';

export default function CreateListPage() {
  return (
    <main className="flex-1 bg-paper p-6 text-slate-900">
      <h1 className="mb-6 text-2xl font-semibold">Create a wishlist</h1>
      <CreateListForm />
    </main>
  );
}
