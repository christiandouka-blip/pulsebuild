/**
 * Explicit demo vs production runtime. Unset local/test defaults to demo.
 * Hosted Vercel production and preview fail closed unless mode is production.
 * Explicit demo is rejected on those hosted customer origins at request time.
 * Never treat a missing database as "allow everything".
 * Explicit PULSEBUILD_RUNTIME_MODE=production always wins over VITEST.
 */

export const RUNTIME_MODES = ["demo", "production"] as const;

export type RuntimeMode = (typeof RUNTIME_MODES)[number];

export type EnvRecord = Record<string, string | undefined>;

const BUILD_PHASES = new Set([
  "phase-production-build",
  "phase-development-build",
]);

export function getRuntimeMode(env: EnvRecord = process.env): RuntimeMode {
  const explicit = env.PULSEBUILD_RUNTIME_MODE?.trim();
  const hostedCustomer =
    env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
  const building = BUILD_PHASES.has(env.NEXT_PHASE ?? "");

  if (explicit === "demo" && hostedCustomer && !building) {
    throw new Error(
      "PULSEBUILD_RUNTIME_MODE=demo is not allowed on hosted Vercel production or preview.",
    );
  }

  if (explicit === "production" || explicit === "demo") {
    return explicit;
  }
  if (explicit) {
    throw new Error(
      `Invalid PULSEBUILD_RUNTIME_MODE "${explicit}". Use "demo" or "production".`,
    );
  }

  if (env.VITEST) {
    return "demo";
  }

  if (building) {
    return "demo";
  }

  if (hostedCustomer) {
    throw new Error(
      'PULSEBUILD_RUNTIME_MODE is required on hosted Vercel production and preview. Set it to "production".',
    );
  }

  return "demo";
}

export function isProductionRuntime(env: EnvRecord = process.env): boolean {
  return getRuntimeMode(env) === "production";
}

export function isDemoRuntime(env: EnvRecord = process.env): boolean {
  return getRuntimeMode(env) === "demo";
}
