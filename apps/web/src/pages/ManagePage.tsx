import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { OwnerTokenGate } from '../features/manage/OwnerTokenGate';
import { AddItemForm } from '../features/manage/AddItemForm';

export default function ManagePage() {
  const { slug } = useParams<{ slug: string }>();
  const [entered, setEntered] = useState(false);
  const [expired, setExpired] = useState(false);
  if (!slug) return null;

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Manage your list</h1>
        {entered ? (
          <AddItemForm slug={slug} onUnauthorized={() => { setEntered(false); setExpired(true); }} />
        ) : (
          <OwnerTokenGate
            slug={slug} onSuccess={() => { setEntered(true); setExpired(false); }}
            notice={expired ? 'Enter your owner token again.' : undefined}
          />
        )}
      </div>
    </main>
  );
}
