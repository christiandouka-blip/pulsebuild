"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/layout/Button";
import type { SignalType } from "@/domain/types/signal";
import { publicOperationalMessage } from "@/domain/operations/publicErrors";
import { commitWorkspaceObservation } from "@/lib/operations/commitClient";

const SIGNAL_TYPES: SignalType[] = [
  "SafetyIncident",
  "InspectionFailed",
  "InspectionMissing",
  "CriticalEquipmentFailure",
  "MaterialDeliveryDelayed",
  "CrewShortage",
  "WeatherAlert",
  "PermitPending",
  "TaskBehindSchedule",
  "MinorDelay",
  "TaskComplete",
  "DeliveryReceived",
];

export function ObservationSubmitPanel() {
  const [signalType, setSignalType] = useState<SignalType>("WeatherAlert");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [relatedEntityType, setRelatedEntityType] = useState("weather");
  const [relatedEntityId, setRelatedEntityId] = useState("");
  const [relatedTaskId, setRelatedTaskId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await commitWorkspaceObservation({
      signalType,
      title,
      description,
      relatedEntityType,
      relatedEntityId,
      relatedTaskId,
      payload: {},
    });
    setPending(false);
    if (result.status !== "Committed" && result.status !== "AlreadyCommitted") {
      setError(publicOperationalMessage(result.status));
      return;
    }
    setTitle("");
    setDescription("");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-md border border-surface-border bg-surface-card px-4 py-4"
    >
      <h2 className="text-sm font-semibold text-slate-100">
        Submit observation
      </h2>
      <p className="mt-1 text-xs text-muted-text">
        Structured production intake. Authorization and persistence happen on
        the server before reasoning runs.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs text-muted-text">
          Signal type
          <select
            className="mt-1 w-full rounded-md border border-surface-border bg-surface-elevated px-2 py-1 text-sm text-slate-100"
            value={signalType}
            onChange={(event) => setSignalType(event.target.value as SignalType)}
          >
            {SIGNAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-text">
          Title
          <input
            className="mt-1 w-full rounded-md border border-surface-border bg-surface-elevated px-2 py-1 text-sm text-slate-100"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        <label className="text-xs text-muted-text md:col-span-2">
          Description
          <input
            className="mt-1 w-full rounded-md border border-surface-border bg-surface-elevated px-2 py-1 text-sm text-slate-100"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </label>
        <label className="text-xs text-muted-text">
          Related entity type
          <input
            className="mt-1 w-full rounded-md border border-surface-border bg-surface-elevated px-2 py-1 text-sm text-slate-100"
            value={relatedEntityType}
            onChange={(event) => setRelatedEntityType(event.target.value)}
            required
          />
        </label>
        <label className="text-xs text-muted-text">
          Related entity id
          <input
            className="mt-1 w-full rounded-md border border-surface-border bg-surface-elevated px-2 py-1 text-sm text-slate-100"
            value={relatedEntityId}
            onChange={(event) => setRelatedEntityId(event.target.value)}
            required
          />
        </label>
        <label className="text-xs text-muted-text md:col-span-2">
          Related task id
          <input
            className="mt-1 w-full rounded-md border border-surface-border bg-surface-elevated px-2 py-1 text-sm text-slate-100"
            value={relatedTaskId}
            onChange={(event) => setRelatedTaskId(event.target.value)}
            required
          />
        </label>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-warning-amber" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="sm" className="mt-3" disabled={pending}>
        {pending ? "Committing…" : "Commit observation"}
      </Button>
    </form>
  );
}
