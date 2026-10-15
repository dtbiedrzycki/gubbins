import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { OwnerTokenGate } from '../features/manage/OwnerTokenGate';
import { AddItemForm } from '../features/manage/AddItemForm';

export default function ManagePage() {
  const { slug } = useParams<{ slug: string }>();
  const [entered, setEntered] = useState(false);
  const [expired, setExpired] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // The gate's submit button unmounts on success; keep keyboard focus on the page.
  useEffect(() => { if (entered) heading.current?.focus(); }, [entered]);
  if (!slug) return null;

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-sm space-y-6">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold">Manage your list</h1>
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
