import { isProductionRuntime, type EnvRecord } from "@/lib/auth/runtimeMode";
import { createDemoProjectRepository } from "@/lib/repositories/demoProjectRepository";
import { createPostgresProjectRepository } from "@/lib/repositories/postgresProjectWorldSource";
import type { ProjectRepository } from "@/lib/repositories/types";

/**
 * Application composition helper.
 *
 * demo → Harbor Point DemoProjectRepository
 * production → PostgresProjectRepository
 *
 * Production never falls back to Harbor Point when database data is missing.
 */
export function selectProjectRepository(
  env: EnvRecord = process.env,
): ProjectRepository {
  if (isProductionRuntime(env)) {
    return createPostgresProjectRepository(env);
  }
  return createDemoProjectRepository();
}
