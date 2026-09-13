import { SignInPanel } from "@/components/auth/SignInPanel";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const production = isProductionRuntime();

  return (
    <main className="flex min-h-screen items-center justify-center bg-command-navy px-4">
      <div className="flex flex-col items-center gap-4">
        {production ? null : (
          <p className="max-w-md text-center text-sm text-muted-text">
            Demo mode is running Harbor Point without authentication. Production
            sign-in is available below for flow validation only.
          </p>
        )}
        <SignInPanel entraOnly={production} callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
