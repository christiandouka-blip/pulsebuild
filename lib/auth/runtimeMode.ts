/**
 * Explicit demo vs production runtime. Unset local/test defaults to demo.
 * Hosted production (Vercel production) fails closed unless mode is set.
 * Never treat a missing database as "allow everything".
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

  if (BUILD_PHASES.has(env.NEXT_PHASE ?? "")) {
    return "demo";
  }

  if (env.VERCEL_ENV === "production") {
    throw new Error(
      'PULSEBUILD_RUNTIME_MODE is required in hosted production. Set it to "production".',
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
