import { createDrizzleIdentityDirectory } from "@/lib/db/identityDirectory";
import { createDrizzleProjectCatalog } from "@/lib/db/projectCatalog";
import { getDb } from "@/lib/db/client";
import { createPostgresOperationalStore } from "@/lib/operations/postgres";
import type { OperationalStore } from "@/lib/operations/ports";
import { selectProjectRepository } from "@/lib/repositories/selectProjectRepository";
import type { IdentityDirectory } from "@/lib/auth/identityDirectory";
import type { ProjectRepository } from "@/lib/repositories/types";
import type { ProjectCatalog } from "@/lib/workspace/types";
import { logPilotEvent } from "@/lib/diagnostics/log";

export type ProductionWorkspacePorts =
  | {
      status: "ready";
      directory: IdentityDirectory;
      catalog: ProjectCatalog;
      repository: ProjectRepository;
      operationalStore: OperationalStore;
    }
  | { status: "DatabaseUnavailable" };

/**
 * Compose production identity, catalog, repository, and operational ports.
 * A missing or unusable database is an explicit failure, not Harbor Point.
 */
export function createProductionWorkspacePorts(): ProductionWorkspacePorts {
  try {
    const db = getDb();
    return {
      status: "ready",
      directory: createDrizzleIdentityDirectory(db),
      catalog: createDrizzleProjectCatalog(db),
      repository: selectProjectRepository(),
      operationalStore: createPostgresOperationalStore(db),
    };
  } catch {
    logPilotEvent({ area: "database", outcome: "unavailable" });
    return { status: "DatabaseUnavailable" };
  }
}
