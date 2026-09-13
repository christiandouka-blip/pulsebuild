import { NewProjectImportForm } from "@/components/import/NewProjectImportForm";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";

export const dynamic = "force-dynamic";

export default function NewProjectPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-signal-cyan">
        Onboarding
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Create and import a project</h1>
      <p className="mt-2 text-sm text-muted-text">
        Upload a PulseBuild CSV or XLSX template. Nothing is written to
        operational records until you confirm the preview.
      </p>
      <p className="mt-4 text-sm">
        Templates:{" "}
        <a
          className="text-signal-cyan underline"
          href="/templates/pulsebuild-project-import.xlsx"
        >
          XLSX workbook
        </a>
        {" · "}
        <a
          className="text-signal-cyan underline"
          href="/templates/pulsebuild-tasks.csv"
        >
          task-focused CSV
        </a>
      </p>
      {isProductionRuntime() ? (
        <NewProjectImportForm />
      ) : (
        <p className="mt-6 text-sm text-warning-amber">
          Project import is available in production mode only. Harbor Point
          remains on the Command Center demo path.
        </p>
      )}
    </main>
  );
}
