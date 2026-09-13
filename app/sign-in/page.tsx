import { SignInPanel } from "@/components/auth/SignInPanel";
import { isDemoRuntime } from "@/lib/auth/runtimeMode";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const demo = isDemoRuntime();

  return (
    <main className="flex min-h-screen items-center justify-center bg-command-navy px-4">
      <div className="flex flex-col items-center gap-4">
        {demo ? (
          <p className="max-w-md text-center text-sm text-muted-text">
            Demo mode is running Harbor Point without authentication. Production
            sign-in is available below for flow validation only.
          </p>
        ) : null}
        <SignInPanel />
      </div>
    </main>
  );
}
