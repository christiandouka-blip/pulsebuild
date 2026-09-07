/**
 * Phase 3C effect application — pure translation of resolved OperationalEffect
 * values onto a derived EffectiveProjectSnapshot.
 *
 * Ordering: input-array order. No timestamp sort, no priority, no last-write
 * wins. A later effect sees the effective state produced by earlier Applied
 * results. Same effect id is never applied twice.
 *
 * Structured identity only. No recommendation prose, no Phase 3A engines, no
 * snapshot mutation, no store.
 */

import { createEffectiveProjectSnapshot } from "@/domain/effects/effectiveSnapshot";
import type { EffectiveProjectSnapshot } from "@/domain/effects/effectiveSnapshot";
import type {
  CrewAssignmentChangedEffect,
  EffectAlreadyApplied,
  EffectApplicationRecord,
  EffectApplicationRejected,
  EffectApplicationRejectionCode,
  EffectApplicationResult,
  EffectProvenance,
  MaterialDeliveryReceivedEffect,
  OperationalEffect,
  TaskCompletedEffect,
} from "@/domain/effects/types";
import type { Crew, Material } from "@/domain/types/resources";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { Task } from "@/domain/types/task";

export type EffectApplicationBatch = {
  effective: EffectiveProjectSnapshot;
  results: readonly EffectApplicationResult[];
};

export type SingleEffectApplication = {
  effective: EffectiveProjectSnapshot;
  result: EffectApplicationResult;
};

export function effectProvenance(effect: OperationalEffect): EffectProvenance {
  if (effect.effectType === "CrewAssignmentChanged") {
    return {
      source: "decision",
      decisionId: effect.decisionId,
      recommendationId: effect.recommendationId,
      signalId: effect.signalId,
      issueId: effect.issueId,
      ruleId: effect.ruleId,
    };
  }
  return { source: "observation", signalId: effect.signalId };
}

/**
 * Apply one effect to the current effective state. Pure. Rejected and
 * AlreadyApplied paths return the input effective object unchanged.
 */
export function applyOperationalEffect(
  effective: EffectiveProjectSnapshot,
  effect: OperationalEffect,
): SingleEffectApplication {
  switch (effect.effectType) {
    case "CrewAssignmentChanged":
      return applyCrewAssignmentChanged(effective, effect);
    case "MaterialDeliveryReceived":
      return applyMaterialDeliveryReceived(effective, effect);
    case "TaskCompleted":
      return applyTaskCompleted(effective, effect);
    default: {
      const exhaustive: never = effect;
      return {
        effective,
        result: applicationRejected(
          exhaustive,
          "INVALID_EFFECT_IDENTITY",
          `Unhandled effect type: ${String(exhaustive)}`,
        ),
      };
    }
  }
}

/**
 * Apply effects in input order against a baseline snapshot.
 *
 * Later effects operate on the effective result of earlier Applied effects.
 * Every input effect produces exactly one result. History records Applied
 * outcomes only.
 */
export function applyOperationalEffects(
  snapshot: ProjectSnapshot,
  effects: readonly OperationalEffect[],
): EffectApplicationBatch {
  let effective = createEffectiveProjectSnapshot(snapshot);
  const results: EffectApplicationResult[] = [];
  for (const effect of effects) {
    const next = applyOperationalEffect(effective, effect);
    effective = next.effective;
    results.push(next.result);
  }
  return { effective, results };
}

function applyCrewAssignmentChanged(
  effective: EffectiveProjectSnapshot,
  effect: CrewAssignmentChangedEffect,
): SingleEffectApplication {
  const existing = findApplied(effective, effect.id);
  if (existing) {
    return { effective, result: alreadyApplied(effect, existing) };
  }

  const identityError = validateEffectIdentity(effect);
  if (identityError) return { effective, result: identityError };

  const snapshot = effective.snapshot;
  const crew = snapshot.crews.find((c) => c.id === effect.crewId);
  if (!crew) {
    return {
      effective,
      result: applicationRejected(
        effect,
        "CREW_NOT_FOUND",
        `Crew ${effect.crewId} does not exist in the effective snapshot.`,
      ),
    };
  }

  const origin = snapshot.tasks.find((t) => t.id === effect.originTaskId);
  if (!origin) {
    return {
      effective,
      result: applicationRejected(
        effect,
        "ORIGIN_TASK_NOT_FOUND",
        `Origin task ${effect.originTaskId} does not exist in the effective snapshot.`,
      ),
    };
  }

  const target = snapshot.tasks.find((t) => t.id === effect.targetTaskId);
  if (!target) {
    return {
      effective,
      result: applicationRejected(
        effect,
        "TARGET_TASK_NOT_FOUND",
        `Target task ${effect.targetTaskId} does not exist in the effective snapshot.`,
      ),
    };
  }

  if (effect.originTaskId === effect.targetTaskId) {
    return {
      effective,
      result: applicationRejected(
        effect,
        "ORIGIN_EQUALS_TARGET",
        `Crew reassignment origin ${effect.originTaskId} is the same as the target.`,
      ),
    };
  }

  if (!target.requiredCrewIds.includes(effect.crewId)) {
    return {
      effective,
      result: applicationRejected(
        effect,
        "TARGET_DOES_NOT_REQUIRE_CREW",
        `Target task ${effect.targetTaskId} does not list ${effect.crewId} in requiredCrewIds.`,
      ),
    };
  }

  if (crew.status === "off_site") {
    return {
      effective,
      result: applicationRejected(
        effect,
        "CREW_NOT_ASSIGNABLE",
        `Crew ${effect.crewId} is off_site and cannot receive an assignment under the existing CrewStatus model.`,
      ),
    };
  }

  const currentAssignment = crew.currentTaskId;
  if (currentAssignment === effect.targetTaskId) {
    return {
      effective,
      result: applicationRejected(
        effect,
        "CREW_ALREADY_AT_TARGET",
        `Crew ${effect.crewId} is already assigned to ${effect.targetTaskId}; a different effect id cannot replay that assignment.`,
      ),
    };
  }

  if (
    currentAssignment !== null &&
    currentAssignment !== effect.originTaskId
  ) {
    return {
      effective,
      result: applicationRejected(
        effect,
        "ASSIGNMENT_CONFLICT",
        `Crew ${effect.crewId} is assigned to ${currentAssignment}, not origin ${effect.originTaskId}; no Product Owner rule authorizes overwriting that assignment.`,
      ),
    };
  }

  const nextCrew: Crew = {
    ...crew,
    currentTaskId: effect.targetTaskId,
    status: "assigned",
  };
  const record: EffectApplicationRecord = {
    effectId: effect.id,
    effectType: effect.effectType,
    entityId: effect.crewId,
    simulatedAt: effect.simulatedAt,
    provenance: effectProvenance(effect),
    changes: [
      {
        field: "currentTaskId",
        previousValue: currentAssignment,
        newValue: effect.targetTaskId,
      },
      {
        field: "status",
        previousValue: crew.status,
        newValue: "assigned",
      },
    ],
    decisionId: effect.decisionId,
    ruleId: effect.ruleId,
    field: "currentTaskId",
    previousValue: currentAssignment,
    newValue: effect.targetTaskId,
    previousStatus: crew.status,
    newStatus: "assigned",
  };

  const nextEffective: EffectiveProjectSnapshot = {
    baseline: effective.baseline,
    snapshot: {
      ...snapshot,
      crews: snapshot.crews.map((c) => (c.id === crew.id ? nextCrew : c)),
    },
    applied: [...effective.applied, record],
  };

  return {
    effective: nextEffective,
    result: { outcome: "Applied", record },
  };
}

function applyMaterialDeliveryReceived(
  effective: EffectiveProjectSnapshot,
  effect: MaterialDeliveryReceivedEffect,
): SingleEffectApplication {
  const existing = findApplied(effective, effect.id);
  if (existing) {
    return { effective, result: alreadyApplied(effect, existing) };
  }

  if (
    !hasText(effect.id) ||
    !hasText(effect.signalId) ||
    !hasText(effect.materialId) ||
    !hasText(effect.simulatedAt)
  ) {
    return {
      effective,
      result: applicationRejected(
        effect,
        "INVALID_EFFECT_IDENTITY",
        "Material delivery effect identity is incomplete.",
      ),
    };
  }

  const snapshot = effective.snapshot;
  const material = snapshot.materials.find((m) => m.id === effect.materialId);
  if (!material) {
    return {
      effective,
      result: applicationRejected(
        effect,
        "MATERIAL_NOT_FOUND",
        `Material ${effect.materialId} does not exist in the effective snapshot.`,
      ),
    };
  }

  if (material.deliveryStatus === "received") {
    return {
      effective,
      result: applicationRejected(
        effect,
        "MATERIAL_ALREADY_RECEIVED",
        `Material ${effect.materialId} is already received; a different effect id cannot rewrite delivery state.`,
      ),
    };
  }

  const nextMaterial: Material = {
    ...material,
    deliveryStatus: "received",
    quantityReceived: effect.quantityReceived,
  };
  const record: EffectApplicationRecord = {
    effectId: effect.id,
    effectType: effect.effectType,
    entityId: effect.materialId,
    simulatedAt: effect.simulatedAt,
    provenance: effectProvenance(effect),
    changes: [
      {
        field: "deliveryStatus",
        previousValue: material.deliveryStatus,
        newValue: "received",
      },
      {
        field: "quantityReceived",
        previousValue: material.quantityReceived,
        newValue: effect.quantityReceived,
      },
    ],
  };

  return {
    effective: {
      baseline: effective.baseline,
      snapshot: {
        ...snapshot,
        materials: snapshot.materials.map((m) =>
          m.id === material.id ? nextMaterial : m,
        ),
      },
      applied: [...effective.applied, record],
    },
    result: { outcome: "Applied", record },
  };
}

function applyTaskCompleted(
  effective: EffectiveProjectSnapshot,
  effect: TaskCompletedEffect,
): SingleEffectApplication {
  const existing = findApplied(effective, effect.id);
  if (existing) {
    return { effective, result: alreadyApplied(effect, existing) };
  }

  if (
    !hasText(effect.id) ||
    !hasText(effect.signalId) ||
    !hasText(effect.taskId) ||
    !hasText(effect.simulatedAt) ||
    !hasText(effect.actualEnd)
  ) {
    return {
      effective,
      result: applicationRejected(
        effect,
        "INVALID_EFFECT_IDENTITY",
        "Task completion effect identity is incomplete.",
      ),
    };
  }

  const snapshot = effective.snapshot;
  const task = snapshot.tasks.find((t) => t.id === effect.taskId);
  if (!task) {
    return {
      effective,
      result: applicationRejected(
        effect,
        "TASK_NOT_FOUND",
        `Task ${effect.taskId} does not exist in the effective snapshot.`,
      ),
    };
  }

  if (task.status === "Completed") {
    return {
      effective,
      result: applicationRejected(
        effect,
        "TASK_ALREADY_COMPLETED",
        `Task ${effect.taskId} is already Completed; a different effect id cannot rewrite completion.`,
      ),
    };
  }

  const nextTask: Task = {
    ...task,
    status: "Completed",
    actualEnd: effect.actualEnd,
  };
  const record: EffectApplicationRecord = {
    effectId: effect.id,
    effectType: effect.effectType,
    entityId: effect.taskId,
    simulatedAt: effect.simulatedAt,
    provenance: effectProvenance(effect),
    changes: [
      {
        field: "status",
        previousValue: task.status,
        newValue: "Completed",
      },
      {
        field: "actualEnd",
        previousValue: task.actualEnd ?? null,
        newValue: effect.actualEnd,
      },
    ],
  };

  return {
    effective: {
      baseline: effective.baseline,
      snapshot: {
        ...snapshot,
        tasks: snapshot.tasks.map((t) => (t.id === task.id ? nextTask : t)),
      },
      applied: [...effective.applied, record],
    },
    result: { outcome: "Applied", record },
  };
}

function findApplied(
  effective: EffectiveProjectSnapshot,
  effectId: string,
): EffectApplicationRecord | undefined {
  return effective.applied.find((record) => record.effectId === effectId);
}

function validateEffectIdentity(
  effect: CrewAssignmentChangedEffect,
): EffectApplicationRejected | null {
  if (!hasText(effect.id)) {
    return applicationRejected(
      effect,
      "INVALID_EFFECT_IDENTITY",
      "Effect id is required and must be a non-empty string.",
    );
  }
  if (!hasText(effect.decisionId)) {
    return applicationRejected(
      effect,
      "INVALID_EFFECT_IDENTITY",
      "Effect decisionId is required and must be a non-empty string.",
    );
  }
  if (!hasText(effect.crewId)) {
    return applicationRejected(
      effect,
      "INVALID_EFFECT_IDENTITY",
      "Effect crewId is required and must be a non-empty string.",
    );
  }
  if (!hasText(effect.originTaskId) || !hasText(effect.targetTaskId)) {
    return applicationRejected(
      effect,
      "INVALID_EFFECT_IDENTITY",
      "Effect originTaskId and targetTaskId are required.",
    );
  }
  if (!hasText(effect.simulatedAt)) {
    return applicationRejected(
      effect,
      "INVALID_EFFECT_IDENTITY",
      "Effect simulatedAt is required and must be a non-empty string.",
    );
  }
  return null;
}

function alreadyApplied(
  effect: OperationalEffect,
  record: EffectApplicationRecord,
): EffectAlreadyApplied {
  const provenance = effectProvenance(effect);
  return {
    outcome: "AlreadyApplied",
    effectId: effect.id,
    provenance,
    record,
    ...(provenance.source === "decision"
      ? { decisionId: provenance.decisionId }
      : {}),
  };
}

function applicationRejected(
  effect: OperationalEffect,
  code: EffectApplicationRejectionCode,
  message: string,
): EffectApplicationRejected {
  const provenance = effectProvenance(effect);
  return {
    outcome: "Rejected",
    code,
    effectId: effect.id,
    provenance,
    message,
    ...(provenance.source === "decision"
      ? { decisionId: provenance.decisionId }
      : {}),
  };
}

function hasText(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
