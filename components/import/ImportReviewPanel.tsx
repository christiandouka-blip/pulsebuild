"use client";

import { useActionState } from "react";

import { Button } from "@/components/layout/Button";
import type { ImportIssue, ProjectImportPreview } from "@/domain/import/types";
import {
  confirmProjectImportAction,
  selectImportPhaseAction,
  type ImportActionState,
} from "@/lib/import/actions";

const initial: ImportActionState = undefined;

export function ImportReviewPanel(props: {
  importId: string;
  preview: ProjectImportPreview;
  imported: boolean;
  status: string;
  projectId: string | null;
}) {
  const [state, confirmAction] = useActionState(
    confirmProjectImportAction,
    initial,
  );
  const blocking = props.preview.issues.filter((item) => item.severity === "Error");
  const warnings = props.preview.issues.filter((item) => item.severity === "Warning");

  if (props.imported || props.status === "Imported") {
    return (
      <div className="mt-6 rounded-xl border border-build-green/40 bg-surface-card p-6">
        <h2 className="text-lg font-semibold text-build-green">Import complete</h2>
        <p className="mt-2 text-sm text-muted-text">
          Project {props.projectId} was persisted and reloaded through
          ProjectRepository.
        </p>
        {props.projectId ? (
          <p className="mt-4 text-sm">
            <a
              className="text-signal-cyan underline"
              href={`/projects/${props.projectId}`}
            >
              Open in Command Center
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Count label="Phases" value={props.preview.phaseCount} />
        <Count label="Tasks" value={props.preview.taskCount} />
        <Count label="Crews" value={props.preview.crewCount} />
        <Count label="Materials" value={props.preview.materialCount} />
        <Count label="Equipment" value={props.preview.equipmentCount} />
        <Count label="Inspections" value={props.preview.inspectionCount} />
        <Count label="Permits" value={props.preview.permitCount} />
        <Count label="Critical path" value={props.preview.criticalPathCount} />
        <Count label="Errors" value={props.preview.errorCount} />
        <Count label="Warnings" value={props.preview.warningCount} />
      </dl>

      <form action={selectImportPhaseAction} className="flex flex-col gap-2">
        <input type="hidden" name="importId" value={props.importId} />
        <label className="text-sm">
          Current phase
          <select
            name="currentPhaseExternalId"
            defaultValue={props.preview.selectedCurrentPhaseExternalId ?? ""}
            className="mt-1 h-9 w-full rounded-md border border-surface-border bg-surface-elevated px-3 text-sm"
          >
            <option value="">Select a phase</option>
            {props.preview.phaseOptions.map((phase) => (
              <option key={phase.externalId} value={phase.externalId}>
                {phase.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Save current phase
        </Button>
      </form>

      <IssueList title="Errors" items={blocking} tone="error" />
      <IssueList title="Warnings" items={warnings} tone="warning" />

      <form action={confirmAction} className="flex flex-col gap-3">
        <input type="hidden" name="importId" value={props.importId} />
        {warnings.length > 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="acknowledgeWarnings" />
            I have reviewed the warnings
          </label>
        ) : null}
        <Button type="submit" disabled={blocking.length > 0}>
          Confirm import
        </Button>
        {state?.error ? (
          <p className="text-sm text-warning-amber" role="alert">
            {state.error}
          </p>
        ) : null}
        <p className="text-xs text-muted-text">
          Confirmation is checked again on the server. A disabled button is not
          sufficient authorization to persist.
        </p>
      </form>
    </div>
  );
}

function Count(props: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-card px-3 py-2">
      <dt className="text-xs text-muted-text">{props.label}</dt>
      <dd className="font-data text-lg">{props.value}</dd>
    </div>
  );
}

function IssueList(props: {
  title: string;
  items: ImportIssue[];
  tone: "error" | "warning";
}) {
  if (props.items.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold">{props.title}</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {props.items.map((item, index) => (
          <li
            key={`${item.code}-${index}`}
            className={
              props.tone === "error"
                ? "rounded-md border border-safety-red/40 p-3 text-sm"
                : "rounded-md border border-warning-amber/40 p-3 text-sm"
            }
          >
            <p>{item.message}</p>
            <p className="mt-1 text-xs text-muted-text">
              {item.sheet ? `${item.sheet} ` : ""}
              {item.row ? `row ${item.row} ` : ""}
              {item.field ?? item.code}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
