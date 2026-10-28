import { useQuery } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { enabledChannels } from '@/features/auth/login-code';

type Health = { ok: boolean; database: boolean; email: boolean; sms: boolean; storage: boolean };

/**
 * Scaffold placeholder. The demo UI (reference/Favorite-Hearts-Integrated/product)
 * moves in here screen by screen from Stage 1 onwards.
 */
export default function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<Health> => {
      const res = await fetch(`${env.apiUrl}/health`);
      return res.json();
    },
  });

  const status = (value: boolean | undefined) => (value === undefined ? '…' : value ? 'ready' : 'not configured');
  const rows: [string, string][] = [
    ['API', health.isError ? 'not reachable' : health.data ? 'reachable' : '…'],
    ['Database', status(health.data?.database)],
    ['Email codes (Resend)', status(health.data?.email)],
    ['SMS codes', status(health.data?.sms)],
    ['File storage (R2)', status(health.data?.storage)],
    ['Sign-in options shown', enabledChannels().join(' + ') || 'none'],
  ];

  return (
    <main className="mx-auto max-w-xl px-4 py-16 font-sans">
      <h1 className="text-3xl font-semibold">Favorite Hearts</h1>
      <p className="mt-2 text-neutral-600">Member app scaffold. No real accounts yet.</p>
      <dl className="mt-8 divide-y divide-neutral-200 rounded-xl border border-neutral-200">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-3 text-sm">
            <dt className="font-medium">{label}</dt>
            <dd className="text-right text-neutral-600">{value}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
