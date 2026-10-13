"use client";

import { useActionState, useId, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";

import { Button } from "@/components/layout/Button";
import {
  createProjectImportAction,
  type ImportActionState,
} from "@/lib/import/actions";

const initial: ImportActionState = undefined;

export function NewProjectImportForm() {
  const [state, action] = useActionState(createProjectImportAction, initial);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputId = useId();
  const fileHelpId = useId();
  const fileErrorId = useId();

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <label className="text-sm">
        Project name
        <input
          name="name"
          required
          className="mt-1 h-9 w-full rounded-md border border-surface-border bg-surface-elevated px-3 text-sm"
        />
      </label>
      <label className="text-sm">
        IANA timezone
        <input
          name="timezone"
          required
          defaultValue="America/Chicago"
          className="mt-1 h-9 w-full rounded-md border border-surface-border bg-surface-elevated px-3 text-sm"
        />
      </label>
      <label className="text-sm">
        Project start (YYYY-MM-DD)
        <input
          name="startDate"
          required
          placeholder="2026-01-01"
          className="mt-1 h-9 w-full rounded-md border border-surface-border bg-surface-elevated px-3 text-sm"
        />
      </label>
      <label className="text-sm">
        Target date (optional)
        <input
          name="targetDate"
          placeholder="2027-12-31"
          className="mt-1 h-9 w-full rounded-md border border-surface-border bg-surface-elevated px-3 text-sm"
        />
      </label>
      <label className="text-sm">
        Location (optional)
        <input
          name="location"
          className="mt-1 h-9 w-full rounded-md border border-surface-border bg-surface-elevated px-3 text-sm"
        />
      </label>
      <div className="text-sm">
        <span className="block">Project workbook</span>
        <input
          id={fileInputId}
          name="file"
          type="file"
          accept=".csv,.xlsx"
          required
          aria-describedby={
            fileError ? `${fileHelpId} ${fileErrorId}` : fileHelpId
          }
          aria-invalid={fileError ? true : undefined}
          onInvalid={(event) => {
            // Keep native required validation, but suppress the default bubble
            // (which would anchor to the visually hidden input) in favour of an
            // inline, screen-reader-announced message.
            event.preventDefault();
            setFileError("Select a CSV or XLSX workbook to continue.");
          }}
          onChange={(event) => {
            const selected = event.target.files?.[0]?.name ?? null;
            setFileName(selected);
            if (selected) setFileError(null);
          }}
          className="peer sr-only"
        />
        <label
          htmlFor={fileInputId}
          className="mt-1 inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-surface-border bg-surface-elevated px-4 font-medium text-slate-100 transition-colors hover:bg-surface-card peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-signal-cyan/50"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Choose workbook
        </label>
        <p id={fileHelpId} className="mt-1 text-xs text-muted-text">
          CSV or XLSX · Maximum 4 MB
        </p>
        <div className="mt-2" role="status" aria-live="polite">
          {fileName ? (
            <span className="inline-flex max-w-full items-center gap-2 text-slate-100">
              <FileSpreadsheet
                className="h-4 w-4 shrink-0 text-signal-cyan"
                aria-hidden="true"
              />
              <span className="truncate">{fileName}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-text">No file selected</span>
          )}
        </div>
        {fileError ? (
          <p
            id={fileErrorId}
            role="alert"
            className="mt-2 text-sm text-warning-amber"
          >
            {fileError}
          </p>
        ) : null}
      </div>
      {state?.error ? (
        <p className="text-sm text-warning-amber" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit">Parse and review</Button>
    </form>
  );
}
