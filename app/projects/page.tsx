import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceFailureView } from "@/components/workspace/WorkspaceFailureView";
import { toAuthPortIdentity } from "@/lib/auth/authPort";
import { auth } from "@/lib/auth/nextAuth";
import { readRequestedOrganizationId } from "@/lib/auth/server";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";
import { listAuthorizedWorkspaceProjects } from "@/lib/workspace/listProjects";
import { createProductionWorkspacePorts } from "@/lib/workspace/productionPorts";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (!isProductionRuntime()) {
    redirect("/");
  }

  const session = await auth();
  const identity = toAuthPortIdentity(session);
  if (!identity) {
    redirect("/sign-in");
  }

  const ports = createProductionWorkspacePorts();
  if (ports.status !== "ready") {
    return <WorkspaceFailureView status="DatabaseUnavailable" />;
  }

  const listed = await listAuthorizedWorkspaceProjects({
    identity,
    requestedOrganizationId: await readRequestedOrganizationId(),
    directory: ports.directory,
    catalog: ports.catalog,
  });

  if (listed.status === "Unauthenticated") {
    redirect("/sign-in");
  }
  if (
    listed.status === "ActiveOrganizationRequired" ||
    listed.status === "InvalidActiveOrganization"
  ) {
    redirect("/select-organization");
  }
  if (listed.status !== "Listed") {
    return <WorkspaceFailureView status={listed.status} />;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-signal-cyan">
        Workspace
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Projects</h1>
      <p className="mt-2 text-sm text-muted-text">
        Select a project you are authorized to open. The Command Center loads
        only the PostgreSQL snapshot for this organization.
      </p>
      {listed.role === "Owner" ? (
        <p className="mt-4 text-sm">
          <Link className="text-signal-cyan underline" href="/projects/new">
            Import a new project
          </Link>
        </p>
      ) : null}
      {listed.projects.length === 0 ? (
        <p className="mt-8 text-sm text-muted-text">
          No projects are available in this organization.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {listed.projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-card px-4 py-3 hover:border-signal-cyan/50"
              >
                <span>
                  <span className="block font-medium text-slate-100">
                    {project.name}
                  </span>
                  <span className="mt-1 block text-xs text-muted-text">
                    {project.status}
                  </span>
                </span>
                <span className="text-sm text-signal-cyan">Open</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
