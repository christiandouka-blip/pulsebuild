"use server";

import type {
  ProductionDecisionInput,
  ProductionObservationInput,
} from "@/domain/operations/types";
import type { OperationalCommandResult } from "@/lib/operations/service";
import {
  commitProductionDecision,
  commitProductionObservation,
} from "@/lib/operations/service";
import { toAuthPortIdentity } from "@/lib/auth/authPort";
import { auth } from "@/lib/auth/nextAuth";
import { readRequestedOrganizationId } from "@/lib/auth/server";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";
import { createServerClock } from "@/lib/import/clock";
import { createProductionWorkspacePorts } from "@/lib/workspace/productionPorts";
import { logPilotEvent } from "@/lib/diagnostics/log";

export type ProductionCommitActionResult = OperationalCommandResult;

function unavailable(): OperationalCommandResult {
  logPilotEvent({ area: "operations", outcome: "unavailable", status: "DatabaseUnavailable" });
  return { status: "DatabaseUnavailable" };
}

const QUIET_OPERATIONAL_STATUSES = new Set<OperationalCommandResult["status"]>([
  "Committed",
  "AlreadyCommitted",
  "Unauthenticated",
  "UnknownIdentity",
  "NotOrganizationMember",
  "InvalidActiveOrganization",
  "ActiveOrganizationRequired",
  "ProjectNotFound",
  "ProjectAccessDenied",
  "CapabilityDenied",
  "InvalidObservation",
  "InvalidTransition",
]);

function logCommitFailure(status: OperationalCommandResult["status"]) {
  if (QUIET_OPERATIONAL_STATUSES.has(status)) {
    return;
  }
  const outcome =
    status === "ReconstructionFailure"
      ? "reconstruction_failed"
      : status === "PersistenceConflict"
        ? "persist_conflict"
        : status === "DatabaseUnavailable"
          ? "unavailable"
          : "commit_failed";
  logPilotEvent({
    area: "operations",
    outcome,
    status,
  });
}

export async function commitProductionObservationAction(input: {
  projectId: string;
  observation: ProductionObservationInput;
}): Promise<ProductionCommitActionResult> {
  if (!isProductionRuntime()) {
    return { status: "CapabilityDenied", capability: "observation:submit" };
  }
  const session = await auth();
  const identity = toAuthPortIdentity(session);
  const ports = createProductionWorkspacePorts();
  if (ports.status !== "ready") return unavailable();
  const result = await commitProductionObservation({
    identity,
    requestedOrganizationId: await readRequestedOrganizationId(),
    projectId: input.projectId,
    observation: input.observation,
    directory: ports.directory,
    repository: ports.repository,
    store: ports.operationalStore,
    clock: createServerClock(),
  });
  logCommitFailure(result.status);
  return result;
}

export async function commitProductionDecisionAction(input: {
  projectId: string;
  decision: ProductionDecisionInput;
}): Promise<ProductionCommitActionResult> {
  if (!isProductionRuntime()) {
    return { status: "CapabilityDenied", capability: "decision:approve" };
  }
  const session = await auth();
  const identity = toAuthPortIdentity(session);
  const ports = createProductionWorkspacePorts();
  if (ports.status !== "ready") return unavailable();
  const result = await commitProductionDecision({
    identity,
    requestedOrganizationId: await readRequestedOrganizationId(),
    projectId: input.projectId,
    decision: input.decision,
    directory: ports.directory,
    repository: ports.repository,
    store: ports.operationalStore,
    clock: createServerClock(),
  });
  logCommitFailure(result.status);
  return result;
}
