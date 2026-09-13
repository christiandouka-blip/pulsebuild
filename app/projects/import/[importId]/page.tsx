import { notFound } from "next/navigation";

import { ImportReviewPanel } from "@/components/import/ImportReviewPanel";
import { isAuthorized } from "@/domain/authorization/types";
import { authorizeCurrentUserToCreateProject } from "@/lib/auth/server";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";
import { getDb } from "@/lib/db/client";
import { createPostgresImportJobStore } from "@/lib/import/postgres";
import { loadImportJobForTenant } from "@/lib/import/service";

export const dynamic = "force-dynamic";

export default async function ImportReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ importId: string }>;
  searchParams: Promise<{ imported?: string }>;
}) {
  const { importId } = await params;
  const query = await searchParams;

  if (!isProductionRuntime()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Import review</h1>
        <p className="mt-2 text-sm text-warning-amber">
          Project import is available in production mode only.
        </p>
      </main>
    );
  }

  const authorization = await authorizeCurrentUserToCreateProject();
  if (!isAuthorized(authorization)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Import review</h1>
        <p className="mt-2 text-sm text-warning-amber">
          Only an organization Owner can import a new project.
        </p>
      </main>
    );
  }

  const loaded = await loadImportJobForTenant({
    authorization,
    importId,
    store: createPostgresImportJobStore(getDb()),
  });
  if (loaded.status === "not_found") {
    notFound();
  }
  if (loaded.status !== "loaded") {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-signal-cyan">
        Import {loaded.job.status}
      </p>
      <h1 className="mt-2 text-2xl font-semibold">{loaded.preview.projectName}</h1>
      <p className="mt-2 text-sm text-muted-text">
        Source: {loaded.job.sourceFilename} · {loaded.job.sourceType}
      </p>
      <ImportReviewPanel
        importId={importId}
        preview={loaded.preview}
        imported={query.imported === "1" || loaded.job.status === "Imported"}
        status={loaded.job.status}
        projectId={loaded.job.projectId}
      />
    </main>
  );
}
