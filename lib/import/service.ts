import type { AuthorizationResult } from "@/domain/authorization/types";
import { isAuthorized } from "@/domain/authorization/types";
import { makeImportJobId } from "@/domain/import/ids";
import { errorCount, hasBlockingErrors, warningCount } from "@/domain/import/issues";
import type {
  CreateImportJobInput,
  ImportJobRecord,
  ProjectImportPreview,
  ProjectSetupInput,
} from "@/domain/import/types";
import type { InstantClock } from "@/lib/import/clock";
import { guardImportFile } from "@/lib/import/fileGuard";
import { parseCsvWorkbook } from "@/lib/import/parseCsv";
import { parseXlsxWorkbook } from "@/lib/import/parseXlsx";
import { normalizeWorkbook } from "@/lib/import/normalizeWorkbook";
import { buildImportPreview } from "@/lib/import/preview";
import { stagingToConstructionRecords } from "@/lib/import/toConstructionRecords";
import { validateNormalizedImport } from "@/lib/import/validateNormalized";
import type { ImportJobStore, ImportPersistence } from "@/lib/import/ports";
import { mapProjectSnapshot } from "@/lib/repositories/projectSnapshotMapper";

export function assertOwnerCanImport(
  authorization: AuthorizationResult,
): AuthorizationResult {
  if (!isAuthorized(authorization)) return authorization;
  if (authorization.role !== "Owner") {
    return { status: "CapabilityDenied", capability: "project:create" };
  }
  return authorization;
}

export async function createParsedImportJob(input: {
  authorization: AuthorizationResult;
  setup: ProjectSetupInput;
  filename: string;
  bytes: Uint8Array;
  mimeType?: string;
  clock: InstantClock;
  store: ImportJobStore;
}): Promise<
  | { status: "created"; job: ImportJobRecord; preview: ProjectImportPreview }
  | { status: "rejected"; issues: ImportJobRecord["issues"] }
  | { status: "unauthorized"; authorization: AuthorizationResult }
> {
  const authorized = assertOwnerCanImport(input.authorization);
  if (!isAuthorized(authorized)) {
    return { status: "unauthorized", authorization: authorized };
  }

  const createdAt = input.clock.nowIso();
  const guarded = guardImportFile({
    filename: input.filename,
    bytes: input.bytes,
    mimeType: input.mimeType,
  });
  if (!guarded.ok) {
    return { status: "rejected", issues: guarded.issues };
  }

  const parsed =
    guarded.file.fileType === "csv"
      ? parseCsvWorkbook(guarded.file.bytes)
      : parseXlsxWorkbook(guarded.file.bytes);
  if (
    parsed.sheets.length === 0 ||
    hasBlockingErrors(parsed.issues.filter((item) => item.entityType === "file"))
  ) {
    return { status: "rejected", issues: parsed.issues };
  }

  const normalized = normalizeWorkbook({
    sheets: parsed.sheets,
    setup: input.setup,
  });
  const validation = validateNormalizedImport(
    normalized.staging,
    input.setup.currentPhaseExternalId ??
      normalized.staging.project.currentPhaseExternalId,
  );
  const issues = [...parsed.issues, ...normalized.issues, ...validation];
  const preview = buildImportPreview(
    normalized.staging,
    issues,
    input.setup.currentPhaseExternalId ??
      normalized.staging.project.currentPhaseExternalId,
  );

  const job: ImportJobRecord = {
    id: makeImportJobId({
      organizationId: authorized.scope.organizationId,
      actorUserId: authorized.scope.actorUserId,
      filename: guarded.file.filename,
      createdAt,
      bytes: guarded.file.bytes,
    }),
    organizationId: authorized.scope.organizationId,
    actorUserId: authorized.scope.actorUserId,
    projectId: null,
    sourceFilename: guarded.file.filename,
    sourceType: guarded.file.fileType,
    status: hasBlockingErrors(issues)
      ? parsed.issues.some((item) => item.code.startsWith("file.") && item.severity === "Error")
        ? "Failed"
        : "NeedsReview"
      : "ReadyToImport",
    createdAt,
    validatedAt: createdAt,
    confirmedAt: null,
    errorCount: errorCount(issues),
    warningCount: warningCount(issues),
    phaseCount: preview.phaseCount,
    taskCount: preview.taskCount,
    crewCount: preview.crewCount,
    materialCount: preview.materialCount,
    equipmentCount: preview.equipmentCount,
    inspectionCount: preview.inspectionCount,
    permitCount: preview.permitCount,
    criticalPathCount: preview.criticalPathCount,
    staging: normalized.staging,
    issues,
    selectedCurrentPhaseExternalId:
      input.setup.currentPhaseExternalId ??
      normalized.staging.project.currentPhaseExternalId ??
      null,
    warningsAcknowledged: false,
  };

  if (job.status === "Failed") {
    return { status: "rejected", issues };
  }

  await input.store.save(job);
  return { status: "created", job, preview };
}

export async function loadImportJobForTenant(input: {
  authorization: AuthorizationResult;
  importId: string;
  store: ImportJobStore;
}): Promise<
  | { status: "loaded"; job: ImportJobRecord; preview: ProjectImportPreview }
  | { status: "not_found" }
  | { status: "unauthorized"; authorization: AuthorizationResult }
> {
  const authorized = assertOwnerCanImport(input.authorization);
  if (!isAuthorized(authorized)) {
    return { status: "unauthorized", authorization: authorized };
  }
  const job = await input.store.get({
    organizationId: authorized.scope.organizationId,
    importId: input.importId,
  });
  if (!job) return { status: "not_found" };
  if (!job.staging) return { status: "not_found" };
  return {
    status: "loaded",
    job,
    preview: buildImportPreview(
      job.staging,
      job.issues,
      job.selectedCurrentPhaseExternalId,
    ),
  };
}

export async function selectImportCurrentPhase(input: {
  authorization: AuthorizationResult;
  importId: string;
  currentPhaseExternalId: string;
  clock: InstantClock;
  store: ImportJobStore;
}): Promise<
  | { status: "updated"; job: ImportJobRecord; preview: ProjectImportPreview }
  | { status: "not_found" }
  | { status: "unauthorized"; authorization: AuthorizationResult }
> {
  const loaded = await loadImportJobForTenant(input);
  if (loaded.status !== "loaded") return loaded;
  if (loaded.job.status === "Imported") {
    return {
      status: "updated",
      job: loaded.job,
      preview: loaded.preview,
    };
  }
  const validation = validateNormalizedImport(
    loaded.job.staging!,
    input.currentPhaseExternalId,
  );
  const issues = [
    ...loaded.job.issues.filter(
      (item) =>
        item.code !== "project.current_phase_required" &&
        item.code !== "project.current_phase_missing",
    ),
    ...validation.filter(
      (item) =>
        item.code === "project.current_phase_required" ||
        item.code === "project.current_phase_missing",
    ),
  ];
  const job: ImportJobRecord = {
    ...loaded.job,
    selectedCurrentPhaseExternalId: input.currentPhaseExternalId,
    issues,
    errorCount: errorCount(issues),
    warningCount: warningCount(issues),
    validatedAt: input.clock.nowIso(),
    status: hasBlockingErrors(issues) ? "NeedsReview" : "ReadyToImport",
  };
  await input.store.save(job);
  return {
    status: "updated",
    job,
    preview: buildImportPreview(
      job.staging!,
      job.issues,
      job.selectedCurrentPhaseExternalId,
    ),
  };
}

export async function confirmImportJob(input: {
  authorization: AuthorizationResult;
  importId: string;
  acknowledgeWarnings: boolean;
  clock: InstantClock;
  store: ImportJobStore;
  persistence: ImportPersistence;
}): Promise<
  | { status: "Imported"; projectId: string; preview: ProjectImportPreview }
  | { status: "AlreadyImported"; projectId: string }
  | { status: "rejected"; issues: ImportJobRecord["issues"] }
  | { status: "not_found" }
  | { status: "unauthorized"; authorization: AuthorizationResult }
  | { status: "rolled_back"; message: string }
> {
  const loaded = await loadImportJobForTenant(input);
  if (loaded.status !== "loaded") return loaded;
  const job = loaded.job;
  if (job.status === "Imported" && job.projectId) {
    return { status: "AlreadyImported", projectId: job.projectId };
  }
  if (!job.staging) {
    return { status: "not_found" };
  }

  const revalidated = validateNormalizedImport(
    job.staging,
    job.selectedCurrentPhaseExternalId,
  );
  const issues = [...revalidated];
  if (hasBlockingErrors(issues)) {
    return { status: "rejected", issues };
  }
  if (warningCount(job.issues) > 0 && !input.acknowledgeWarnings) {
    return {
      status: "rejected",
      issues: [
        ...job.issues,
        {
          severity: "Error",
          code: "import.warnings_unacknowledged",
          entityType: "project",
          message: "Warnings must be acknowledged before confirmation.",
        },
      ],
    };
  }

  const currentPhase = job.selectedCurrentPhaseExternalId;
  if (!currentPhase) {
    return { status: "rejected", issues: revalidated };
  }

  const records = stagingToConstructionRecords({
    importJobId: job.id,
    organizationId: job.organizationId,
    staging: job.staging,
    currentPhaseExternalId: currentPhase,
  });
  const operationalAt = input.clock.nowIso();
  const mapped = mapProjectSnapshot(records, operationalAt);
  if (mapped.status === "InvalidProjectData") {
    return {
      status: "rejected",
      issues: mapped.diagnostics.map((message) => ({
        severity: "Error" as const,
        code: "import.snapshot_invalid",
        entityType: "project" as const,
        message,
      })),
    };
  }

  const persisted = await input.persistence.persistConfirmedImport({
    job,
    records,
    confirmedAt: operationalAt,
    currentOperationalAt: operationalAt,
  });

  if (persisted.status === "AlreadyImported") {
    return persisted;
  }
  if (persisted.status === "activation_failed") {
    return {
      status: "rejected",
      issues: persisted.diagnostics.map((message) => ({
        severity: "Error" as const,
        code: "import.activation_failed",
        entityType: "project" as const,
        message,
      })),
    };
  }
  if (persisted.status === "rolled_back") {
    return persisted;
  }

  const preview = buildImportPreview(job.staging, issues, currentPhase);
  return {
    status: "Imported",
    projectId: persisted.projectId,
    preview,
  };
}

export type { CreateImportJobInput };
