import { redirect } from "next/navigation";

import { CommandCenterShell } from "@/components/command-center/CommandCenterShell";
import { WorkspaceFailureView } from "@/components/workspace/WorkspaceFailureView";
import { toAuthPortIdentity } from "@/lib/auth/authPort";
import { auth } from "@/lib/auth/nextAuth";
import { createServerClock } from "@/lib/import/clock";
import { readRequestedOrganizationId } from "@/lib/auth/server";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";
import { loadProductionWorkspace } from "@/lib/workspace/loadWorkspace";
import { createProductionWorkspacePorts } from "@/lib/workspace/productionPorts";

export const dynamic = "force-dynamic";

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  if (!isProductionRuntime()) {
    redirect("/");
  }

  const { projectId } = await params;
  const session = await auth();
  const identity = toAuthPortIdentity(session);
  if (!identity) {
    redirect("/sign-in");
  }

  const ports = createProductionWorkspacePorts();
  if (ports.status !== "ready") {
    return <WorkspaceFailureView status="DatabaseUnavailable" />;
  }

  const loaded = await loadProductionWorkspace({
    identity,
    requestedOrganizationId: await readRequestedOrganizationId(),
    projectId,
    directory: ports.directory,
    repository: ports.repository,
    store: ports.operationalStore,
    clock: createServerClock(),
  });

  if (loaded.status === "Unauthenticated") {
    redirect("/sign-in");
  }
  if (
    loaded.status === "ActiveOrganizationRequired" ||
    loaded.status === "InvalidActiveOrganization"
  ) {
    redirect("/select-organization");
  }
  if (loaded.status !== "Loaded") {
    return <WorkspaceFailureView status={loaded.status} />;
  }

  return (
    <CommandCenterShell
      workspaceSnapshot={loaded.snapshot}
      workspaceOperational={loaded.operational}
    />
  );
}
