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

export type ProductionCommitActionResult = OperationalCommandResult;

function unavailable(): OperationalCommandResult {
  return { status: "DatabaseUnavailable" };
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
  return commitProductionObservation({
    identity,
    requestedOrganizationId: await readRequestedOrganizationId(),
    projectId: input.projectId,
    observation: input.observation,
    directory: ports.directory,
    repository: ports.repository,
    store: ports.operationalStore,
    clock: createServerClock(),
  });
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
  return commitProductionDecision({
    identity,
    requestedOrganizationId: await readRequestedOrganizationId(),
    projectId: input.projectId,
    decision: input.decision,
    directory: ports.directory,
    repository: ports.repository,
    store: ports.operationalStore,
    clock: createServerClock(),
  });
}
