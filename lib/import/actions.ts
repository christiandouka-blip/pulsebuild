"use server";

import { redirect } from "next/navigation";

import { isAuthorized } from "@/domain/authorization/types";
import { createServerClock } from "@/lib/import/clock";
import {
  confirmImportJob,
  createParsedImportJob,
  selectImportCurrentPhase,
} from "@/lib/import/service";
import {
  createPostgresImportJobStore,
  createPostgresImportPersistence,
} from "@/lib/import/postgres";
import { authorizeCurrentUserToCreateProject } from "@/lib/auth/server";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";
import { getDb } from "@/lib/db/client";

export type ImportActionState = { error: string } | void;

function productionGuard(): string | null {
  if (!isProductionRuntime()) {
    return "Project import is available in production mode only.";
  }
  return null;
}

export async function createProjectImportAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const demo = productionGuard();
  if (demo) return { error: demo };

  const authorization = await authorizeCurrentUserToCreateProject();
  if (!isAuthorized(authorization)) {
    return { error: "You are not allowed to create a project." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Upload a .csv or .xlsx file." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const db = getDb();
  const result = await createParsedImportJob({
    authorization,
    setup: {
      name: String(formData.get("name") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
      startDate: String(formData.get("startDate") ?? ""),
      location: String(formData.get("location") ?? ""),
      targetDate: String(formData.get("targetDate") ?? "") || undefined,
    },
    filename: file.name,
    bytes,
    mimeType: file.type,
    clock: createServerClock(),
    store: createPostgresImportJobStore(db),
  });

  if (result.status === "unauthorized") {
    return { error: "You are not allowed to create a project." };
  }
  if (result.status === "rejected") {
    return {
      error: result.issues[0]?.message ?? "The file could not be imported.",
    };
  }
  redirect(`/projects/import/${result.job.id}`);
}

export async function selectImportPhaseAction(formData: FormData) {
  const demo = productionGuard();
  if (demo) return;
  const authorization = await authorizeCurrentUserToCreateProject();
  const importId = String(formData.get("importId") ?? "");
  const db = getDb();
  await selectImportCurrentPhase({
    authorization,
    importId,
    currentPhaseExternalId: String(formData.get("currentPhaseExternalId") ?? ""),
    clock: createServerClock(),
    store: createPostgresImportJobStore(db),
  });
  redirect(`/projects/import/${importId}`);
}

export async function confirmProjectImportAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const demo = productionGuard();
  if (demo) return { error: demo };

  const authorization = await authorizeCurrentUserToCreateProject();
  const importId = String(formData.get("importId") ?? "");
  const db = getDb();
  const result = await confirmImportJob({
    authorization,
    importId,
    acknowledgeWarnings: formData.get("acknowledgeWarnings") === "on",
    clock: createServerClock(),
    store: createPostgresImportJobStore(db),
    persistence: createPostgresImportPersistence(db),
  });

  if (result.status === "unauthorized") {
    return { error: "You are not allowed to import a project." };
  }
  if (result.status === "not_found") {
    return { error: "Import was not found." };
  }
  if (result.status === "rejected") {
    return {
      error: result.issues.find((item) => item.severity === "Error")?.message ??
        "Import confirmation was rejected.",
    };
  }
  if (result.status === "rolled_back") {
    return { error: result.message };
  }
  redirect(`/projects/import/${importId}?imported=1`);
}
