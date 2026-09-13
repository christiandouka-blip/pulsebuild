import { and, eq } from "drizzle-orm";

import type { ImportJobRecord } from "@/domain/import/types";
import { projectImportJobs } from "@/drizzle/schema/imports";
import type { Database } from "@/lib/db/client";
import { persistConstructionRecords } from "@/lib/import/persistConstruction";
import type { ImportJobStore, ImportPersistence } from "@/lib/import/ports";
import { createProjectRepository } from "@/lib/repositories/projectRepository";
import {
  loadPostgresProjectWorldFromSession,
} from "@/lib/repositories/postgresProjectWorldSource";
import type { ProjectConstructionRecords } from "@/lib/repositories/types";

export function createPostgresImportJobStore(db: Database): ImportJobStore {
  return {
    async get(input) {
      const [row] = await db
        .select()
        .from(projectImportJobs)
        .where(
          and(
            eq(projectImportJobs.id, input.importId),
            eq(projectImportJobs.organizationId, input.organizationId),
          ),
        )
        .limit(1);
      return row ? fromRow(row) : null;
    },
    async save(job) {
      const values = toRow(job);
      await db
        .insert(projectImportJobs)
        .values(values)
        .onConflictDoUpdate({
          target: projectImportJobs.id,
          set: values,
        });
    },
  };
}

export function createPostgresImportPersistence(
  db: Database,
): ImportPersistence {
  return {
    async persistConfirmedImport(input) {
      try {
        return await db.transaction(async (tx) => {
          const [locked] = await tx
            .select()
            .from(projectImportJobs)
            .where(
              and(
                eq(projectImportJobs.id, input.job.id),
                eq(projectImportJobs.organizationId, input.job.organizationId),
              ),
            )
            .limit(1)
            .for("update");

          if (!locked) {
            return {
              status: "rolled_back" as const,
              message: "Import job was not found.",
            };
          }
          if (locked.status === "Imported" && locked.projectId) {
            return {
              status: "AlreadyImported" as const,
              projectId: locked.projectId,
            };
          }

          await persistConstructionRecords(tx as unknown as Database, input.records);

          const world = await loadPostgresProjectWorldFromSession(
            tx as unknown as Database,
            {
              organizationId: input.job.organizationId,
              projectId: input.records.project.id,
            },
          );
          if (!world) {
            throw new Error("Imported project was not visible in the write transaction.");
          }
          const repository = createProjectRepository({
            async loadProjectWorld() {
              return world;
            },
          });
          const loaded = await repository.loadProjectSnapshot({
            tenantScope: {
              organizationId: input.job.organizationId,
              actorUserId: input.job.actorUserId,
            },
            projectId: input.records.project.id,
            currentOperationalAt: input.currentOperationalAt,
          });
          if (loaded.status !== "Loaded") {
            throw new Error(
              loaded.status === "InvalidProjectData"
                ? loaded.diagnostics.join("; ")
                : loaded.status,
            );
          }

          await tx
            .update(projectImportJobs)
            .set({
              status: "Imported",
              projectId: input.records.project.id,
              confirmedAt: new Date(input.confirmedAt),
            })
            .where(eq(projectImportJobs.id, input.job.id));

          return {
            status: "persisted" as const,
            projectId: input.records.project.id,
          };
        });
      } catch (error) {
        return {
          status: "rolled_back" as const,
          message:
            error instanceof Error ? error.message : "Import persistence failed.",
        };
      }
    },
  };
}

function toRow(job: ImportJobRecord) {
  return {
    id: job.id,
    organizationId: job.organizationId,
    actorUserId: job.actorUserId,
    projectId: job.projectId,
    sourceFilename: job.sourceFilename,
    sourceType: job.sourceType,
    status: job.status,
    createdAt: new Date(job.createdAt),
    validatedAt: job.validatedAt ? new Date(job.validatedAt) : null,
    confirmedAt: job.confirmedAt ? new Date(job.confirmedAt) : null,
    errorCount: job.errorCount,
    warningCount: job.warningCount,
    phaseCount: job.phaseCount,
    taskCount: job.taskCount,
    crewCount: job.crewCount,
    materialCount: job.materialCount,
    equipmentCount: job.equipmentCount,
    inspectionCount: job.inspectionCount,
    permitCount: job.permitCount,
    criticalPathCount: job.criticalPathCount,
    stagingPayload: job.staging,
    issues: job.issues,
    selectedCurrentPhaseExternalId: job.selectedCurrentPhaseExternalId,
    warningsAcknowledged: job.warningsAcknowledged,
  };
}

function fromRow(row: typeof projectImportJobs.$inferSelect): ImportJobRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    actorUserId: row.actorUserId,
    projectId: row.projectId,
    sourceFilename: row.sourceFilename,
    sourceType: row.sourceType,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    validatedAt: row.validatedAt ? row.validatedAt.toISOString() : null,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    errorCount: row.errorCount,
    warningCount: row.warningCount,
    phaseCount: row.phaseCount,
    taskCount: row.taskCount,
    crewCount: row.crewCount,
    materialCount: row.materialCount,
    equipmentCount: row.equipmentCount,
    inspectionCount: row.inspectionCount,
    permitCount: row.permitCount,
    criticalPathCount: row.criticalPathCount,
    staging: (row.stagingPayload as ImportJobRecord["staging"]) ?? null,
    issues: (row.issues as ImportJobRecord["issues"]) ?? [],
    selectedCurrentPhaseExternalId: row.selectedCurrentPhaseExternalId,
    warningsAcknowledged: row.warningsAcknowledged,
  };
}

export type { ProjectConstructionRecords };
