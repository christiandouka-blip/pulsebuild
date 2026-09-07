import {
  RECOMMENDATION_RANK,
  type RecommendationRankBand,
  type RecommendationRuleId,
} from "@/domain/constants/recommendationRules";
import type {
  DependencyImpact,
  PredictionResult,
  PriorityResult,
} from "@/domain/types/analysis";
import type { ContextSnapshot } from "@/domain/types/context";
import type {
  ApprovalRequirement,
  RecommendationActionDescriptor,
  RecommendationAlternative,
  RecommendationProposal,
} from "@/domain/types/recommendation";
import type { ReasoningEvidence } from "@/domain/types/reasoning";
import type { ProjectSignal } from "@/domain/types/signalRuntime";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import type { TaskId } from "@/domain/types/identifiers";
import type { Task } from "@/domain/types/task";

/**
 * Recommendation Engine — evidence-gated proposal generation only.
 *
 * Stages: generate eligible candidates → reject unsupported → rank → select
 * primary + alternatives → action-based approval → action-specific evidence.
 * Does not approve, reject, execute, mutate, or verify.
 */
export type RecommendInput = {
  signal: ProjectSignal;
  snapshot: ProjectSnapshot;
  context: ContextSnapshot;
  dependency: DependencyImpact;
  priority: PriorityResult;
  prediction: PredictionResult;
  issueId: string | null;
};

type RecommendationCandidate = {
  ruleId: RecommendationRuleId;
  rankBand: RecommendationRankBand;
  primaryAction: string;
  rationale: string;
  expectedBenefit: string;
  /** Sole carrier of structured action identity, including the mutates flag. */
  descriptor: RecommendationActionDescriptor;
  approval: ApprovalRequirement;
  evidence: ReasoningEvidence[];
};

export function recommend(input: RecommendInput): RecommendationProposal | null {
  const { signal, priority, prediction, issueId } = input;
  if (issueId === null) return null;

  const generated = generateCandidates(input);
  const eligible = generated.filter((c) => c.evidence.length > 0);
  const ranked = rankCandidates(
    eligible.length > 0 ? eligible : [buildMonitorCandidate(input, "no_supported_stronger_action")],
  );

  const primary = ranked[0];
  const alternatives: RecommendationAlternative[] = ranked.slice(1, 4).map((c) => ({
    action: c.primaryAction,
    rationale: c.rationale,
    expectedBenefit: c.expectedBenefit,
    evidence: c.evidence,
    actionDescriptor: c.descriptor,
  }));

  return {
    id: `rec-${signal.id}`,
    signalId: signal.id,
    issueId,
    primaryAction: primary.primaryAction,
    rationale: primary.rationale,
    expectedBenefit: primary.expectedBenefit,
    approval: primary.approval,
    alternatives,
    actionDescriptor: primary.descriptor,
    confidence: priority.confidence,
    evidence: [
      {
        entityType: "signal",
        entityId: signal.id,
        fact: `Signal type ${signal.type}; priority ${priority.finalTier}; cascade depth ${prediction.cascadeDepth}`,
      },
      ...primary.evidence,
    ],
  };
}

function generateCandidates(input: RecommendInput): RecommendationCandidate[] {
  const { signal } = input;
  const candidates: RecommendationCandidate[] = [];

  if (signal.type === "SafetyIncident") {
    const safety = trySafetyProtect(input);
    if (safety) candidates.push(safety);
  }

  if (signal.type === "InspectionMissing" || signal.type === "InspectionFailed") {
    const inspection = tryInspectionCoordinate(input);
    if (inspection) candidates.push(inspection);
  }

  if (signal.type === "MaterialDeliveryDelayed") {
    const materialProtect = tryMaterialProtect(input);
    if (materialProtect) candidates.push(materialProtect);
    const materialEscalate = tryMaterialEscalate(input);
    if (materialEscalate) candidates.push(materialEscalate);
    const crew = tryCrewReassign(input);
    if (crew) candidates.push(crew);
    const resequence = tryTaskResequence(input);
    if (resequence) candidates.push(resequence);
  }

  if (signal.type === "WeatherAlert") {
    const resequence = tryTaskResequence(input);
    if (resequence) candidates.push(resequence);
  }

  if (signal.type === "CrewShortage") {
    const crew = tryCrewReassign(input);
    if (crew) candidates.push(crew);
  }

  // Always offer the safe monitoring fallback for any open issue.
  candidates.push(buildMonitorCandidate(input, "baseline_monitor"));

  return candidates;
}

function rankCandidates(
  candidates: RecommendationCandidate[],
): RecommendationCandidate[] {
  return [...candidates].sort((a, b) => {
    const rankDelta =
      RECOMMENDATION_RANK[a.rankBand] - RECOMMENDATION_RANK[b.rankBand];
    if (rankDelta !== 0) return rankDelta;
    return a.ruleId.localeCompare(b.ruleId);
  });
}

function trySafetyProtect(input: RecommendInput): RecommendationCandidate | null {
  const { signal, context } = input;
  const taskId = signal.relatedTaskId;
  const req = context.requirementStatusByTask[taskId];
  if (!taskId) return null;

  const evidence: ReasoningEvidence[] = [
    { entityType: "signal", entityId: signal.id, fact: "SafetyIncident observed" },
    { entityType: "task", entityId: taskId, fact: `Affected task in signal scope; blocked=${req?.isBlocked ?? "unknown"}` },
  ];

  return {
    ruleId: "REC_SAFETY_PROTECT",
    rankBand: "safety_protection",
    primaryAction: `Protect affected work on ${taskId} and route the safety condition for human review.`,
    rationale:
      "Safety-related conditions require human decision before any operational change.",
    expectedBenefit: `Protects ${taskId} from unsafe progressive work until a human decision is recorded.`,
    descriptor: {
      ruleId: "REC_SAFETY_PROTECT",
      mutatesOperationalState: true,
      subjectEntityType: "task",
      subjectEntityId: taskId,
      originTaskId: taskId,
    },
    approval: approvalRequired(
      "Safety-related operational intervention requires human approval.",
    ),
    evidence,
  };
}

function tryInspectionCoordinate(
  input: RecommendInput,
): RecommendationCandidate | null {
  const { signal, snapshot, context } = input;
  const taskId = signal.relatedTaskId;
  const req = context.requirementStatusByTask[taskId];
  if (!req || req.inspectionsPassed === "satisfied") return null;

  const inspection =
    snapshot.inspections.find(
      (i) =>
        i.id === signal.relatedEntityId && i.requiredBeforeTaskId === taskId,
    ) ??
    snapshot.inspections.find(
      (i) => i.requiredBeforeTaskId === taskId && i.status !== "passed",
    );

  if (!inspection || inspection.status === "passed") return null;

  const evidence: ReasoningEvidence[] = [
    {
      entityType: "inspection",
      entityId: inspection.id,
      fact: `Required inspection status is ${inspection.status} (not passed)`,
    },
    {
      entityType: "task",
      entityId: taskId,
      fact: `Inspection ${inspection.id} gates task ${taskId}`,
    },
  ];

  // Coordination / completion request — does not invent a reschedule date.
  return {
    ruleId: "REC_INSPECTION_COORDINATE",
    rankBand: "remove_immediate_blocker",
    primaryAction: `Coordinate completion of required inspection ${inspection.id} before releasing gated task ${taskId}.`,
    rationale:
      "Dependent work cannot proceed while the required inspection remains incomplete.",
    expectedBenefit: `Protects ${taskId} from release until inspection ${inspection.id} is passed.`,
    descriptor: {
      ruleId: "REC_INSPECTION_COORDINATE",
      mutatesOperationalState: false,
      subjectEntityType: "inspection",
      subjectEntityId: inspection.id,
      originTaskId: taskId,
    },
    approval: approvalNotRequired(),
    evidence,
  };
}

function tryMaterialProtect(input: RecommendInput): RecommendationCandidate | null {
  const { signal, snapshot, context, prediction } = input;
  if (signal.type !== "MaterialDeliveryDelayed") return null;
  const taskId = signal.relatedTaskId;
  const material = snapshot.materials.find((m) => m.id === signal.relatedEntityId);
  const req = context.requirementStatusByTask[taskId];
  if (!material || !req) return null;

  const evidence: ReasoningEvidence[] = [
    {
      entityType: "material",
      entityId: material.id,
      fact: `Delivery status ${material.deliveryStatus}; expected ${material.expectedDeliveryTime}`,
    },
    {
      entityType: "task",
      entityId: taskId,
      fact: `Materials ready=${req.materialsReady}; blocked=${req.isBlocked}`,
    },
    {
      entityType: "task",
      entityId: taskId,
      fact: `Schedule exposure ${prediction.scheduleExposure.category}`,
    },
  ];

  return {
    ruleId: "REC_MATERIAL_PROTECT",
    rankBand: "protect_productive_work",
    primaryAction: `Protect the plan for ${taskId} until material ${material.id} delivery status is confirmed received.`,
    rationale:
      "Material delay is confirmed for the affected task; releasing the task would ignore an unmet requirement.",
    expectedBenefit: `Maintains the current plan for ${taskId} while delivery timing for ${material.id} remains unconfirmed.`,
    descriptor: {
      ruleId: "REC_MATERIAL_PROTECT",
      mutatesOperationalState: false,
      subjectEntityType: "material",
      subjectEntityId: material.id,
      originTaskId: taskId,
    },
    approval: approvalNotRequired(),
    evidence,
  };
}

function tryMaterialEscalate(input: RecommendInput): RecommendationCandidate | null {
  const { signal, snapshot, context, dependency } = input;
  if (signal.type !== "MaterialDeliveryDelayed") return null;
  const taskId = signal.relatedTaskId;
  const material = snapshot.materials.find((m) => m.id === signal.relatedEntityId);
  const req = context.requirementStatusByTask[taskId];
  if (!material || !req || req.materialsReady === "satisfied") return null;

  const evidence: ReasoningEvidence[] = [
    {
      entityType: "material",
      entityId: material.id,
      fact: `Material blocker status ${material.deliveryStatus}`,
    },
    {
      entityType: "task",
      entityId: taskId,
      fact: `Critical-path=${snapshot.tasks.find((t) => t.id === taskId)?.isCriticalPath === true}; cascade depth ${dependency.cascadeDepth}`,
    },
  ];

  return {
    ruleId: "REC_MATERIAL_ESCALATE",
    rankBand: "protect_productive_work",
    primaryAction: `Escalate the material blocker for ${material.id} affecting task ${taskId}.`,
    rationale:
      "The material requirement remains unsatisfied and continues to block the related task.",
    expectedBenefit: `Surfaces the unmet material requirement for ${material.id} without inventing a substitute delivery.`,
    descriptor: {
      ruleId: "REC_MATERIAL_ESCALATE",
      mutatesOperationalState: false,
      subjectEntityType: "material",
      subjectEntityId: material.id,
      originTaskId: taskId,
    },
    approval: approvalNotRequired(),
    evidence,
  };
}

function tryCrewReassign(input: RecommendInput): RecommendationCandidate | null {
  const { signal, snapshot, context, prediction } = input;
  const originTaskId = signal.relatedTaskId;
  const originTask = snapshot.tasks.find((t) => t.id === originTaskId);
  const req = context.requirementStatusByTask[originTaskId];
  if (!originTask || !req?.isBlocked) return null;

  const idleCrewIds = prediction.idleCrewRisk.crewIds;
  if (idleCrewIds.length === 0) return null;

  // Deterministic crew pick among idle risks that are assigned to or required by origin.
  const eligibleIdle = [...idleCrewIds]
    .filter((crewId) => {
      const crew = snapshot.crews.find((c) => c.id === crewId);
      if (!crew) return false;
      const assignedToOrigin = crew.currentTaskId === originTaskId;
      const requiredByOrigin = originTask.requiredCrewIds.includes(crewId);
      return assignedToOrigin || requiredByOrigin;
    })
    .sort();
  if (eligibleIdle.length === 0) return null;

  const crewId = eligibleIdle[0];
  const crew = snapshot.crews.find((c) => c.id === crewId)!;

  // Reject if the crew is already on another non-blocked productive task.
  if (
    crew.currentTaskId !== null &&
    crew.currentTaskId !== originTaskId &&
    context.requirementStatusByTask[crew.currentTaskId]?.isBlocked !== true
  ) {
    return null;
  }

  const alternateTaskId = findCrewReassignAlternate(input, crewId, originTaskId);
  if (!alternateTaskId) return null;

  const alternate = snapshot.tasks.find((t) => t.id === alternateTaskId)!;
  const alternateReq = context.requirementStatusByTask[alternateTaskId]!;
  const evidence: ReasoningEvidence[] = [
    {
      entityType: "task",
      entityId: originTaskId,
      fact: `Blocked origin task; reasons: ${req.blockingReasons.join("; ") || "blocked"}`,
    },
    {
      entityType: "crew",
      entityId: crewId,
      fact: `Verified idle-crew risk; current assignment ${crew.currentTaskId ?? "none"}`,
    },
    {
      entityType: "task",
      entityId: alternateTaskId,
      fact: `Task.requiredCrewIds includes ${crewId} (${alternate.requiredCrewIds.join(", ")})`,
    },
    {
      entityType: "task",
      entityId: alternateTaskId,
      fact: `Alternate ready for productive work; status=${alternate.status}; predecessors=${alternateReq.predecessorsComplete}; materials=${alternateReq.materialsReady}; inspections=${alternateReq.inspectionsPassed}; permits=${alternateReq.permitsApproved}; equipment=${alternateReq.equipmentAvailable}`,
    },
    {
      entityType: "task",
      entityId: alternateTaskId,
      fact: `Dependency-safe relative to ${originTaskId}: not downstream and does not depend on origin`,
    },
  ];

  return {
    ruleId: "REC_CREW_REASSIGN",
    rankBand: "reduce_idle_resource_risk",
    primaryAction: `Propose reassigning ${crewId} from blocked ${originTaskId} to ${alternateTaskId}. ${alternateTaskId} explicitly requires ${crewId} and its documented requirements and predecessors are satisfied.`,
    rationale: `${alternateTaskId} explicitly requires ${crewId} via Task.requiredCrewIds; ${crewId} is a verified idle risk on blocked ${originTaskId}.`,
    expectedBenefit: `May reduce verified idle exposure while supporting a task that explicitly requires ${crewId}.`,
    descriptor: {
      ruleId: "REC_CREW_REASSIGN",
      mutatesOperationalState: true,
      subjectEntityType: "crew",
      subjectEntityId: crewId,
      originTaskId: originTaskId,
      targetTaskId: alternateTaskId,
    },
    approval: approvalRequired("Crew reassignment requires superintendent approval."),
    evidence,
  };
}

function tryTaskResequence(input: RecommendInput): RecommendationCandidate | null {
  const { signal, snapshot, context, dependency } = input;
  const taskId = signal.relatedTaskId;
  const task = snapshot.tasks.find((t) => t.id === taskId);
  const req = context.requirementStatusByTask[taskId];
  if (!task || !req) return null;

  const exposed = req.isBlocked || dependency.criticalPathImpacted;
  if (!exposed) return null;

  const alternateTaskId = findResequenceAlternate(input);
  if (!alternateTaskId) return null;

  const alternate = snapshot.tasks.find((t) => t.id === alternateTaskId)!;
  const alternateReq = context.requirementStatusByTask[alternateTaskId]!;
  const affectsCriticalPath =
    task.isCriticalPath ||
    alternate.isCriticalPath ||
    dependency.criticalPathImpacted;
  const multiTask = dependency.affectedTaskIds.length > 0;

  const evidence: ReasoningEvidence[] = [
    {
      entityType: "task",
      entityId: taskId,
      fact: `Delayed/exposed task; blocked=${req.isBlocked}; criticalPath=${task.isCriticalPath}`,
    },
    {
      entityType: "task",
      entityId: alternateTaskId,
      fact: `Alternate task can proceed; predecessors=${alternateReq.predecessorsComplete}; blocked=${alternateReq.isBlocked}`,
    },
    {
      entityType: "task",
      entityId: taskId,
      fact: `Dependency cascade depth ${dependency.cascadeDepth}; affected downstream ${dependency.affectedTaskIds.length}`,
    },
  ];

  const approval =
    affectsCriticalPath || multiTask
      ? approvalRequired(
          "Critical-path or multi-task resequencing requires approval.",
        )
      : approvalRequired(
          "Task resequencing changes planned work order and requires approval.",
        );

  return {
    ruleId: "REC_TASK_RESEQUENCE",
    rankBand: "use_ready_alternative",
    primaryAction: `Resequence work: hold exposed task ${taskId} and advance ready alternate task ${alternateTaskId}.`,
    rationale:
      "Dependency and requirement facts show a safe alternate task can proceed while the exposed task remains constrained.",
    expectedBenefit: `Protects continuity by advancing ${alternateTaskId} while ${taskId} remains exposed.`,
    descriptor: {
      ruleId: "REC_TASK_RESEQUENCE",
      mutatesOperationalState: true,
      subjectEntityType: "task",
      subjectEntityId: taskId,
      originTaskId: taskId,
      targetTaskId: alternateTaskId,
    },
    approval,
    evidence,
  };
}

function buildMonitorCandidate(
  input: RecommendInput,
  reasonCode: string,
): RecommendationCandidate {
  const { signal, context, prediction } = input;
  const taskId = signal.relatedTaskId;
  const req = context.requirementStatusByTask[taskId];
  const missing: string[] = [];
  if (!req) missing.push("requirement status unknown");

  const crewReassignConsidered =
    signal.type === "MaterialDeliveryDelayed" || signal.type === "CrewShortage";
  if (crewReassignConsidered) {
    const idleCrewIds = [...prediction.idleCrewRisk.crewIds].sort();
    if (idleCrewIds.length === 0) {
      missing.push("no verified idle crew in signal scope");
    } else {
      const crewId = idleCrewIds[0];
      const alternate = findCrewReassignAlternate(input, crewId, taskId);
      if (alternate === null) {
        missing.push(
          `No ready alternate task explicitly requires ${crewId}, so reassignment is not supported by the current project facts.`,
        );
      }
    }
  }

  const evidence: ReasoningEvidence[] = [
    {
      entityType: "signal",
      entityId: signal.id,
      fact: `Monitoring fallback (${reasonCode}) for ${signal.type}`,
    },
    {
      entityType: "task",
      entityId: taskId,
      fact: `Affected task status facts: blocked=${req?.isBlocked ?? "unknown"}`,
    },
  ];
  if (missing.length > 0) {
    evidence.push({
      entityType: "signal",
      entityId: signal.id,
      fact: `Missing facts that prevented a stronger action: ${missing.join("; ")}`,
    });
  }

  return {
    ruleId: "REC_MONITOR_PROTECT",
    rankBand: "monitor_and_confirm",
    primaryAction: `Monitor the condition on ${taskId}, protect the current plan, and reassess when missing operational facts change.`,
    rationale:
      "No stronger operational action is fully supported by deterministic evidence, or the issue remains low-impact/monitoring-only.",
    expectedBenefit: `Maintains the current plan for ${taskId} while confirming evidence before any assignment or schedule mutation.`,
    descriptor: {
      ruleId: "REC_MONITOR_PROTECT",
      mutatesOperationalState: false,
      subjectEntityType: "task",
      subjectEntityId: taskId,
      originTaskId: taskId,
    },
    approval: approvalNotRequired(),
    evidence,
  };
}

/**
 * Crew-reassignment alternate: must explicitly list the idle crew in
 * Task.requiredCrewIds. Crew availability on the alternate may be unsatisfied
 * solely because that crew is currently stuck on the blocked origin task.
 */
function findCrewReassignAlternate(
  input: RecommendInput,
  crewId: string,
  originTaskId: TaskId,
): TaskId | null {
  const { snapshot, context, dependency } = input;
  const blockedDownstream = new Set(dependency.affectedTaskIds);

  const candidates = snapshot.tasks
    .filter((task) =>
      isEligibleCrewReassignAlternate(
        task,
        originTaskId,
        crewId,
        blockedDownstream,
        context,
        snapshot,
      ),
    )
    .map((t) => t.id)
    .sort();

  return candidates[0] ?? null;
}

/** Alternate for resequencing: ready, unblocked, not downstream; may already have its own crew. */
function findResequenceAlternate(input: RecommendInput): TaskId | null {
  const { snapshot, context, dependency, signal } = input;
  const origin = signal.relatedTaskId;
  const blockedDownstream = new Set(dependency.affectedTaskIds);

  const candidates = snapshot.tasks
    .filter((task) =>
      isEligibleResequenceAlternate(
        task,
        origin,
        blockedDownstream,
        context,
        snapshot,
      ),
    )
    .map((t) => t.id)
    .sort();

  return candidates[0] ?? null;
}

function isEligibleCrewReassignAlternate(
  task: Task,
  originTaskId: TaskId,
  crewId: string,
  blockedDownstream: ReadonlySet<TaskId>,
  context: ContextSnapshot,
  snapshot: ProjectSnapshot,
): boolean {
  if (task.id === originTaskId) return false;
  if (blockedDownstream.has(task.id)) return false;
  if (taskDependsOn(task.id, originTaskId, snapshot)) return false;
  if (!task.requiredCrewIds.includes(crewId)) return false;
  if (task.status !== "Ready" && task.status !== "Executing") return false;

  const req = context.requirementStatusByTask[task.id];
  if (!req) return false;
  if (req.predecessorsComplete !== "satisfied") return false;
  if (req.materialsReady !== "satisfied") return false;
  if (req.inspectionsPassed !== "satisfied") return false;
  if (req.permitsApproved !== "satisfied") return false;
  if (req.equipmentAvailable !== "satisfied") return false;

  // Other required crews (excluding the idle crew being reassigned) must already be satisfied.
  if (!otherRequiredCrewsSatisfied(task, crewId, snapshot)) return false;

  // Conflicting / duplicate assignment on the alternate target.
  const assigned = snapshot.crews.filter((c) => c.currentTaskId === task.id);
  if (assigned.length > 0) return false;

  return true;
}

function isEligibleResequenceAlternate(
  task: Task,
  originTaskId: TaskId,
  blockedDownstream: ReadonlySet<TaskId>,
  context: ContextSnapshot,
  snapshot: ProjectSnapshot,
): boolean {
  if (task.id === originTaskId) return false;
  if (blockedDownstream.has(task.id)) return false;
  if (taskDependsOn(task.id, originTaskId, snapshot)) return false;
  const req = context.requirementStatusByTask[task.id];
  if (!req) return false;
  if (req.isBlocked) return false;
  if (req.predecessorsComplete !== "satisfied") return false;
  if (req.materialsReady !== "satisfied") return false;
  if (req.inspectionsPassed !== "satisfied") return false;
  if (req.permitsApproved !== "satisfied") return false;
  if (req.equipmentAvailable !== "satisfied") return false;
  if (req.crewAvailable !== "satisfied") return false;
  if (task.status !== "Ready" && task.status !== "Executing") return false;
  return true;
}

function otherRequiredCrewsSatisfied(
  task: Task,
  idleCrewId: string,
  snapshot: ProjectSnapshot,
): boolean {
  return task.requiredCrewIds.every((requiredId) => {
    if (requiredId === idleCrewId) return true;
    const crew = snapshot.crews.find((c) => c.id === requiredId);
    if (!crew) return false;
    return crew.currentTaskId === task.id || crew.status === "available";
  });
}

/** True when taskId directly or transitively depends on ancestorId. */
function taskDependsOn(
  taskId: TaskId,
  ancestorId: TaskId,
  snapshot: ProjectSnapshot,
): boolean {
  const taskById = new Map(snapshot.tasks.map((t) => [t.id, t]));
  const seen = new Set<TaskId>();
  const stack: TaskId[] = [...(taskById.get(taskId)?.dependencyTaskIds ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === ancestorId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const node = taskById.get(current);
    if (node) stack.push(...node.dependencyTaskIds);
  }
  return false;
}

function approvalRequired(reason: string): ApprovalRequirement {
  return { required: true, reason };
}

function approvalNotRequired(): ApprovalRequirement {
  return { required: false, reason: null };
}
