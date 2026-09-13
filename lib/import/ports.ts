import type { ImportJobRecord } from "@/domain/import/types";
import type { ProjectConstructionRecords } from "@/lib/repositories/types";

export type ImportJobStore = {
  get(input: {
    organizationId: string;
    importId: string;
  }): Promise<ImportJobRecord | null>;
  save(job: ImportJobRecord): Promise<void>;
};

export type ImportPersistence = {
  persistConfirmedImport(input: {
    job: ImportJobRecord;
    records: ProjectConstructionRecords;
    confirmedAt: string;
    currentOperationalAt: string;
  }): Promise<
    | { status: "persisted"; projectId: string }
    | { status: "AlreadyImported"; projectId: string }
    | { status: "activation_failed"; diagnostics: string[] }
    | { status: "rolled_back"; message: string }
  >;
};
