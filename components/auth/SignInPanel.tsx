"use client";

import { useActionState } from "react";

import { Button } from "@/components/layout/Button";
import {
  signInWithEntraAction,
  signInWithMagicLinkAction,
} from "@/lib/auth/actions";

const initialMagicLinkState: { error: string } | void = undefined;

export function SignInPanel() {
  const [magicLinkState, magicLinkAction] = useActionState(
    async (_prev: { error: string } | void, formData: FormData) => {
      return signInWithMagicLinkAction(formData);
    },
    initialMagicLinkState,
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-8 rounded-xl border border-surface-border bg-surface-card p-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-signal-cyan">
          PulseBuild
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-100">Sign in</h1>
        <p className="mt-2 text-sm text-muted-text">
          Use Microsoft Entra ID for the commercial pilot. Email magic link is
          reserved until a delivery provider is approved.
        </p>
      </div>

      <form action={signInWithEntraAction}>
        <Button type="submit" className="w-full">
          Sign in with Microsoft Entra ID
        </Button>
      </form>

      <div className="border-t border-surface-border pt-6">
        <p className="mb-3 text-xs uppercase tracking-wide text-muted-text">
          Email magic link
        </p>
        <form action={magicLinkAction} className="flex flex-col gap-3">
          <label className="text-sm text-slate-100" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="h-9 rounded-md border border-surface-border bg-surface-elevated px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-signal-cyan/50"
          />
          <Button type="submit" variant="secondary" className="w-full">
            Send magic link
          </Button>
          {magicLinkState?.error ? (
            <p className="text-sm text-warning-amber" role="alert">
              {magicLinkState.error}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
