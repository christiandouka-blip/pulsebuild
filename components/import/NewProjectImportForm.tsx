"use client";

import { useActionState } from "react";

import { Button } from "@/components/layout/Button";
import {
  createProjectImportAction,
  type ImportActionState,
} from "@/lib/import/actions";

const initial: ImportActionState = undefined;

export function NewProjectImportForm() {
  const [state, action] = useActionState(createProjectImportAction, initial);

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
      <label className="text-sm">
        CSV or XLSX file
        <input
          name="file"
          type="file"
          accept=".csv,.xlsx"
          required
          className="mt-1 w-full text-sm"
        />
      </label>
      {state?.error ? (
        <p className="text-sm text-warning-amber" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit">Parse and review</Button>
    </form>
  );
}
