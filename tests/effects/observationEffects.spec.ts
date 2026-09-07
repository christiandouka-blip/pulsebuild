import { describe, expect, it } from "vitest";

import { buildProjectSnapshot } from "@/data/index";
import {
  applyOperationalEffect,
  applyOperationalEffects,
  resolveObservationEffect,
} from "@/domain/effects";
import { intakeObservation } from "@/domain/engines/observationIntake";
import { normalizeSignal } from "@/domain/engines/signalEngine";
import type { ProjectSignal } from "@/domain/types/signalRuntime";
import type { SignalType } from "@/domain/types/signal";

const CONCRETE = "mat-concrete";
const DRYWALL_PREP = "task-interior-drywall-prep";
const RAW_COMPLETED_AT = "2026-03-18T16:45:00-04:00";

function snapshot() {
  return buildProjectSnapshot();
}

function committedSignal(fixtureId: string): ProjectSignal {
  const project = snapshot();
  const fixture = project.scenarioFixtures.find((f) => f.id === fixtureId);
  if (!fixture) throw new Error(`missing fixture ${fixtureId}`);
  const intake = intakeObservation(project, fixture, []);
  if (!intake.ok || !intake.signal) {
    throw new Error(`intake failed: ${intake.warnings.join(", ")}`);
  }
  return normalizeSignal(intake.signal);
}

function deliverySignal(): ProjectSignal {
  return committedSignal("fixture-delivery-received");
}

function completeSignal(): ProjectSignal {
  return committedSignal("fixture-task-complete");
}

function withSignal(
  base: ProjectSignal,
  patch: Partial<ProjectSignal>,
): ProjectSignal {
  return { ...base, ...patch };
}

describe("DeliveryReceived resolution", () => {
  it("resolves to a typed observation effect", () => {
    const signal = deliverySignal();
    const result = resolveObservationEffect(signal);
    expect(result.outcome).toBe("Resolved");
    if (result.outcome !== "Resolved") return;
    expect(result.effect.effectType).toBe("MaterialDeliveryReceived");
    expect(result.effect.source).toBe("observation");
  });

  it("uses the structured material id from the committed signal", () => {
    const signal = deliverySignal();
    expect(signal.relatedEntityId).toBe(CONCRETE);
    const result = resolveObservationEffect(signal);
    expect(result.outcome).toBe("Resolved");
    if (result.outcome !== "Resolved") return;
    if (result.effect.effectType !== "MaterialDeliveryReceived") return;
    expect(result.effect.materialId).toBe(signal.relatedEntityId);
    expect(result.effect.materialId).toBe(CONCRETE);
  });

  it("rejects the wrong relatedEntityType", () => {
    const result = resolveObservationEffect(
      withSignal(deliverySignal(), { relatedEntityType: "task" }),
    );
    expect(result).toMatchObject({
      outcome: "Rejected",
      code: "WRONG_RELATED_ENTITY_TYPE",
    });
  });

  it("rejects a missing material id", () => {
    const result = resolveObservationEffect(
      withSignal(deliverySignal(), { relatedEntityId: "   " }),
    );
    expect(result).toMatchObject({
      outcome: "Rejected",
      code: "MISSING_RELATED_ENTITY_ID",
    });
  });

  it("rejects an invalid deliveryStatus", () => {
    const signal = deliverySignal();
    const result = resolveObservationEffect({
      ...signal,
      rawData: { ...signal.rawData, deliveryStatus: "arrived" },
    });
    expect(result).toMatchObject({
      outcome: "Rejected",
      code: "INVALID_DELIVERY_STATUS",
    });
  });

  it("rejects a valid DeliveryStatus that is not received", () => {
    const signal = deliverySignal();
    const result = resolveObservationEffect({
      ...signal,
      rawData: { ...signal.rawData, deliveryStatus: "delayed" },
    });
    expect(result).toMatchObject({
      outcome: "Rejected",
      code: "DELIVERY_STATUS_NOT_RECEIVED",
    });
  });

  it("rejects an invalid quantityReceived", () => {
    const signal = deliverySignal();
    const result = resolveObservationEffect({
      ...signal,
      rawData: { ...signal.rawData, quantityReceived: -1 },
    });
    expect(result).toMatchObject({
      outcome: "Rejected",
      code: "INVALID_QUANTITY_RECEIVED",
    });
  });

  it("does not parse prose or infer material identity from copy", () => {
    const signal = deliverySignal();
    const result = resolveObservationEffect({
      ...signal,
      rawData: {
        ...signal.rawData,
        title: "Delivery for mat-rebar quantity 999 delayed",
        description: "Ignore this — the material is mat-fixtures.",
        rationale: "Escalate the material blocker",
        expectedBenefit: "Protect the plan",
      },
    });
    expect(result.outcome).toBe("Resolved");
    if (result.outcome !== "Resolved") return;
    if (result.effect.effectType !== "MaterialDeliveryReceived") return;
    expect(result.effect.materialId).toBe(CONCRETE);
    expect(result.effect.quantityReceived).toBe(120);
    expect(result.effect.deliveryStatus).toBe("received");
  });
});

describe("DeliveryReceived application", () => {
  it("sets deliveryStatus to received and the validated quantity", () => {
    const project = snapshot();
    const signal = deliverySignal();
    const resolved = resolveObservationEffect(signal);
    expect(resolved.outcome).toBe("Resolved");
    if (resolved.outcome !== "Resolved") return;

    const before = project.materials.find((m) => m.id === CONCRETE)!;
    expect(before.deliveryStatus).toBe("in_transit");
    expect(before.quantityReceived).toBe(0);
    expect(before.quantityExpected).toBe(120);

    const { effective, results } = applyOperationalEffects(project, [
      resolved.effect,
    ]);
    expect(results[0].outcome).toBe("Applied");
    const after = effective.snapshot.materials.find((m) => m.id === CONCRETE)!;
    expect(after.deliveryStatus).toBe("received");
    expect(after.quantityReceived).toBe(120);
    expect(after.quantityExpected).toBe(before.quantityExpected);
  });

  it("records both field changes from application-time state", () => {
    const project = snapshot();
    const resolved = resolveObservationEffect(deliverySignal());
    if (resolved.outcome !== "Resolved") return;
    const { results } = applyOperationalEffects(project, [resolved.effect]);
    expect(results[0].outcome).toBe("Applied");
    if (results[0].outcome !== "Applied") return;
    expect(results[0].record.changes).toEqual([
      { field: "deliveryStatus", previousValue: "in_transit", newValue: "received" },
      { field: "quantityReceived", previousValue: 0, newValue: 120 },
    ]);
    expect(results[0].record.decisionId).toBeUndefined();
    expect(results[0].record.ruleId).toBeUndefined();
  });

  it("leaves the original material unchanged", () => {
    const project = snapshot();
    const original = project.materials.find((m) => m.id === CONCRETE)!;
    const before = JSON.stringify(original);
    const resolved = resolveObservationEffect(deliverySignal());
    if (resolved.outcome !== "Resolved") return;
    applyOperationalEffects(project, [resolved.effect]);
    expect(JSON.stringify(original)).toBe(before);
    expect(original.deliveryStatus).toBe("in_transit");
    expect(original.quantityReceived).toBe(0);
  });

  it("preserves reference identity of untouched entities and collections", () => {
    const project = snapshot();
    const resolved = resolveObservationEffect(deliverySignal());
    if (resolved.outcome !== "Resolved") return;
    const { effective } = applyOperationalEffects(project, [resolved.effect]);
    expect(effective.snapshot.tasks).toBe(project.tasks);
    expect(effective.snapshot.crews).toBe(project.crews);
    expect(effective.snapshot.equipment).toBe(project.equipment);
    expect(effective.snapshot.inspections).toBe(project.inspections);
    expect(effective.snapshot.permits).toBe(project.permits);
    expect(
      effective.snapshot.materials.find((m) => m.id === "mat-rebar"),
    ).toBe(project.materials.find((m) => m.id === "mat-rebar"));
  });
});

describe("TaskComplete resolution", () => {
  it("resolves to a typed observation effect", () => {
    const result = resolveObservationEffect(completeSignal());
    expect(result.outcome).toBe("Resolved");
    if (result.outcome !== "Resolved") return;
    expect(result.effect.effectType).toBe("TaskCompleted");
    expect(result.effect.source).toBe("observation");
  });

  it("uses the structured task id from the committed signal", () => {
    const signal = completeSignal();
    expect(signal.relatedEntityId).toBe(DRYWALL_PREP);
    const result = resolveObservationEffect(signal);
    expect(result.outcome).toBe("Resolved");
    if (result.outcome !== "Resolved") return;
    if (result.effect.effectType !== "TaskCompleted") return;
    expect(result.effect.taskId).toBe(signal.relatedEntityId);
  });

  it("rejects the wrong relatedEntityType", () => {
    const result = resolveObservationEffect(
      withSignal(completeSignal(), { relatedEntityType: "material" }),
    );
    expect(result).toMatchObject({
      outcome: "Rejected",
      code: "WRONG_RELATED_ENTITY_TYPE",
    });
  });
});

describe("TaskComplete application", () => {
  it("sets status to Completed and actualEnd to observedAtSimulated", () => {
    const project = snapshot();
    const signal = completeSignal();
    const resolved = resolveObservationEffect(signal);
    expect(resolved.outcome).toBe("Resolved");
    if (resolved.outcome !== "Resolved") return;

    const { effective, results } = applyOperationalEffects(project, [
      resolved.effect,
    ]);
    expect(results[0].outcome).toBe("Applied");
    const task = effective.snapshot.tasks.find((t) => t.id === DRYWALL_PREP)!;
    expect(task.status).toBe("Completed");
    expect(task.actualEnd).toBe(signal.observedAtSimulated);
  });

  it("does not let rawData.completedAt control actualEnd", () => {
    const signal = completeSignal();
    expect(signal.rawData.completedAt).toBe(RAW_COMPLETED_AT);
    expect(signal.observedAtSimulated).not.toBe(RAW_COMPLETED_AT);

    const resolved = resolveObservationEffect(signal);
    expect(resolved.outcome).toBe("Resolved");
    if (resolved.outcome !== "Resolved") return;
    if (resolved.effect.effectType !== "TaskCompleted") return;
    expect(resolved.effect.actualEnd).toBe(signal.observedAtSimulated);
    expect(resolved.effect.actualEnd).not.toBe(RAW_COMPLETED_AT);

    const { effective } = applyOperationalEffects(snapshot(), [resolved.effect]);
    const task = effective.snapshot.tasks.find((t) => t.id === DRYWALL_PREP)!;
    expect(task.actualEnd).toBe(signal.observedAtSimulated);
    expect(task.actualEnd).not.toBe(RAW_COMPLETED_AT);
  });

  it("does not invent actualStart", () => {
    const project = snapshot();
    const original = project.tasks.find((t) => t.id === DRYWALL_PREP)!;
    expect(original.actualStart).toBeUndefined();

    const resolved = resolveObservationEffect(completeSignal());
    if (resolved.outcome !== "Resolved") return;
    const { effective } = applyOperationalEffects(project, [resolved.effect]);
    const task = effective.snapshot.tasks.find((t) => t.id === DRYWALL_PREP)!;
    expect(task.actualStart).toBeUndefined();
    expect("actualStart" in task).toBe(false);
  });

  it("leaves the original task unchanged", () => {
    const project = snapshot();
    const original = project.tasks.find((t) => t.id === DRYWALL_PREP)!;
    const before = JSON.stringify(original);
    const resolved = resolveObservationEffect(completeSignal());
    if (resolved.outcome !== "Resolved") return;
    applyOperationalEffects(project, [resolved.effect]);
    expect(JSON.stringify(original)).toBe(before);
    expect(original.status).toBe("Ready");
    expect(original.actualEnd).toBeUndefined();
  });

  it("records both status and actualEnd changes", () => {
    const project = snapshot();
    const signal = completeSignal();
    const resolved = resolveObservationEffect(signal);
    if (resolved.outcome !== "Resolved") return;
    const { results } = applyOperationalEffects(project, [resolved.effect]);
    expect(results[0].outcome).toBe("Applied");
    if (results[0].outcome !== "Applied") return;
    expect(results[0].record.changes).toEqual([
      { field: "status", previousValue: "Ready", newValue: "Completed" },
      {
        field: "actualEnd",
        previousValue: null,
        newValue: signal.observedAtSimulated,
      },
    ]);
  });
});

describe("observation provenance, ids, and unsupported signals", () => {
  it("uses observation provenance and does not fabricate decision ids", () => {
    const result = resolveObservationEffect(deliverySignal());
    expect(result.outcome).toBe("Resolved");
    if (result.outcome !== "Resolved") return;
    expect(result.effect.source).toBe("observation");
    expect(result.effect).not.toHaveProperty("decisionId");
    expect(result.effect).not.toHaveProperty("recommendationId");
    expect(result.effect).not.toHaveProperty("issueId");
    expect(result.effect).not.toHaveProperty("ruleId");
  });

  it("derives a deterministic effect id from the signal", () => {
    const signal = deliverySignal();
    const first = resolveObservationEffect(signal);
    const second = resolveObservationEffect(signal);
    expect(first.outcome).toBe("Resolved");
    expect(second.outcome).toBe("Resolved");
    if (first.outcome !== "Resolved" || second.outcome !== "Resolved") return;
    expect(first.effect.id).toBe(
      `effect-observation-${signal.id}-MaterialDeliveryReceived`,
    );
    expect(first.effect.id).toBe(second.effect.id);
    expect(first.effect.simulatedAt).toBe(signal.observedAtSimulated);
  });

  it("returns NoOperationalEffect for unsupported signal types", () => {
    const unsupported: SignalType[] = [
      "WeatherAlert",
      "MaterialDeliveryDelayed",
      "InspectionMissing",
    ];
    for (const type of unsupported) {
      const fixtureId =
        type === "WeatherAlert"
          ? "fixture-weather-alert"
          : type === "MaterialDeliveryDelayed"
            ? "fixture-material-delay"
            : "fixture-inspection-missing";
      const result = resolveObservationEffect(committedSignal(fixtureId));
      expect(result.outcome).toBe("NoOperationalEffect");
      if (result.outcome !== "NoOperationalEffect") return;
      expect(result.reason).toBe("unsupported_signal_type");
      expect(result.signalType).toBe(type);
    }
  });
});

describe("idempotency, determinism, and isolation", () => {
  it("treats a duplicate observation effect as AlreadyApplied", () => {
    const project = snapshot();
    const resolved = resolveObservationEffect(deliverySignal());
    expect(resolved.outcome).toBe("Resolved");
    if (resolved.outcome !== "Resolved") return;

    const first = applyOperationalEffects(project, [resolved.effect]);
    expect(first.results[0].outcome).toBe("Applied");
    const before = JSON.stringify(first.effective.snapshot);

    const second = applyOperationalEffect(first.effective, resolved.effect);
    expect(second.result.outcome).toBe("AlreadyApplied");
    expect(second.effective).toBe(first.effective);
    expect(JSON.stringify(second.effective.snapshot)).toBe(before);
  });

  it("produces deep-equal output for the same inputs", () => {
    const project = snapshot();
    const delivery = resolveObservationEffect(deliverySignal());
    const complete = resolveObservationEffect(completeSignal());
    expect(delivery.outcome).toBe("Resolved");
    expect(complete.outcome).toBe("Resolved");
    if (delivery.outcome !== "Resolved" || complete.outcome !== "Resolved") {
      return;
    }
    const effects = [delivery.effect, complete.effect];
    expect(resolveObservationEffect(deliverySignal())).toEqual(
      resolveObservationEffect(deliverySignal()),
    );
    expect(applyOperationalEffects(project, effects)).toEqual(
      applyOperationalEffects(project, effects),
    );
  });

  it("does not resolve an OperationalIssue or invoke Health or Drift", () => {
    const project = snapshot();
    const before = JSON.stringify(project);
    const resolved = resolveObservationEffect(deliverySignal());
    if (resolved.outcome !== "Resolved") return;
    const { effective } = applyOperationalEffects(project, [resolved.effect]);
    expect(JSON.stringify(project)).toBe(before);
    expect(effective.snapshot).not.toHaveProperty("issues");
    expect(effective).not.toHaveProperty("health");
    expect(effective).not.toHaveProperty("drift");
    expect(effective.applied[0]?.effectType).toBe("MaterialDeliveryReceived");
  });
});
