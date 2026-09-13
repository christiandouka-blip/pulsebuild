import type { ImportJobRecord } from "@/domain/import/types";
import { createProjectRepository } from "@/lib/repositories/projectRepository";
import type { ProjectConstructionRecords } from "@/lib/repositories/types";
import type { ImportJobStore, ImportPersistence } from "@/lib/import/ports";

export class MemoryImportBackend implements ImportJobStore, ImportPersistence {
  jobs = new Map<string, ImportJobRecord>();
  projects = new Map<string, ProjectConstructionRecords>();
  failNextPersist = false;

  async get(input: {
    organizationId: string;
    importId: string;
  }): Promise<ImportJobRecord | null> {
    const job = this.jobs.get(input.importId);
    if (!job || job.organizationId !== input.organizationId) return null;
    return structuredClone(job);
  }

  async save(job: ImportJobRecord): Promise<void> {
    this.jobs.set(job.id, structuredClone(job));
  }

  async persistConfirmedImport(input: {
    job: ImportJobRecord;
    records: ProjectConstructionRecords;
    confirmedAt: string;
    currentOperationalAt: string;
  }): Promise<
    | { status: "persisted"; projectId: string }
    | { status: "AlreadyImported"; projectId: string }
    | { status: "activation_failed"; diagnostics: string[] }
    | { status: "rolled_back"; message: string }
  > {
    const existing = this.jobs.get(input.job.id);
    if (!existing || existing.organizationId !== input.job.organizationId) {
      return { status: "rolled_back", message: "Import job was not found." };
    }
    if (existing.status === "Imported" && existing.projectId) {
      return { status: "AlreadyImported", projectId: existing.projectId };
    }

    const snapshotJobs = structuredClone(existing);
    const snapshotProjects = structuredClone(this.projects);

    try {
      if (this.failNextPersist) {
        this.failNextPersist = false;
        throw new Error("persist failed");
      }
      this.projects.set(input.records.project.id, structuredClone(input.records));
      const repository = createProjectRepository({
        loadProjectWorld: async (query) => {
          const records = this.projects.get(query.projectId);
          if (!records || records.project.organizationId !== query.organizationId) {
            return null;
          }
          return structuredClone(records);
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
        this.jobs.set(input.job.id, snapshotJobs);
        this.projects = snapshotProjects;
        return {
          status: "activation_failed",
          diagnostics:
            loaded.status === "InvalidProjectData" ? loaded.diagnostics : [loaded.status],
        };
      }
      const imported: ImportJobRecord = {
        ...existing,
        status: "Imported",
        projectId: input.records.project.id,
        confirmedAt: input.confirmedAt,
      };
      this.jobs.set(input.job.id, imported);
      return { status: "persisted", projectId: input.records.project.id };
    } catch (error) {
      this.jobs.set(input.job.id, snapshotJobs);
      this.projects = snapshotProjects;
      return {
        status: "rolled_back",
        message: error instanceof Error ? error.message : "Import persistence failed.",
      };
    }
  }
}
