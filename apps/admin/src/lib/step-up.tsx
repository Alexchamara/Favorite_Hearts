/**
 * "Confirm it is you" (docs/ADMIN-PANEL-PLAN.md, layer 6). Risky actions need a passkey or authenticator code from the
 * last 5 minutes; the server answers STEP_UP_REQUIRED otherwise. This dialog asks for one, then the action is retried
 * once (lib/api.ts does that for API calls; `withStepUp` for sign-in settings).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyRound } from 'lucide-react';
import { CodeInput, useCodeCheck } from '@/components/form/code-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Notice } from '@admin/components/shell';
import { onStepUpRequired } from './api';
import { authClient, check } from './auth-client';
import { keys } from './queries';
import { queryClient } from './query-client';

type Confirm = () => Promise<boolean>;
const StepUpContext = createContext<Confirm>(async () => false);

export const useStepUp = () => useContext(StepUpContext);

/** Runs a sign-in settings call; if it needs a fresh confirmation, asks for one and runs it once more. */
export async function withStepUp<T>(confirm: Confirm, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if ((error as { code?: string }).code !== 'STEP_UP_REQUIRED' || !(await confirm())) throw error;
    return run();
  }
}

export function StepUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const waiting = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>(() => {
    setRound((n) => n + 1);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      waiting.current?.(false);
      waiting.current = resolve;
    });
  }, []);
  useEffect(() => {
    onStepUpRequired(confirm);
    return () => onStepUpRequired(null);
  }, [confirm]);

  const finish = async (confirmed: boolean) => {
    setOpen(false);
    if (confirmed) await queryClient.invalidateQueries({ queryKey: keys.me });
    waiting.current?.(confirmed);
    waiting.current = null;
  };

  return (
    <StepUpContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(next) => { if (!next) void finish(false); }}>
        <DialogContent>
          <DialogHeader>
            <span className="m-kicker uppercase">Confirm it is you</span>
            <DialogTitle>This needs a fresh check</DialogTitle>
            <DialogDescription>
              Changes to payments, plans, payment details, service switches and your sign-in settings need your passkey or
              a code from the last 5 minutes.
            </DialogDescription>
          </DialogHeader>
          <StepUpForm key={round} onDone={() => void finish(true)} />
        </DialogContent>
      </Dialog>
    </StepUpContext.Provider>
  );
}

/** A fresh form for every request (a used code entry stays in its "done" state). */
function StepUpForm({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const usePasskey = async () => {
    setBusy(true);
    setError(null);
    try {
      await check(authClient.signIn.passkey());
      onDone();
    } catch (err) {
      setError((err as Error).message || 'The passkey did not work. Use a code instead.');
    } finally {
      setBusy(false);
    }
  };
  const code = useCodeCheck(async (value) => {
    await check(authClient.twoFactor.verifyTotp({ code: value }));
  }, onDone);
  return (
    <div className="flex flex-col gap-5">
      {error && <Notice tone="error">{error}</Notice>}
      <Button className="h-11 self-start" disabled={busy} onClick={() => void usePasskey()}>
        <KeyRound size={16} aria-hidden="true" />
        Use my passkey
      </Button>
      <CodeInput label="Or enter the code from your authenticator app" value={code.value} onChange={code.change} state={code.state} message={code.message} autoFocus={false} />
    </div>
  );
}
