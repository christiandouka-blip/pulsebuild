import Link from "next/link";

import type { WorkspaceFailureStatus } from "@/lib/workspace/types";
import {
  publicWorkspaceMessage,
  workspaceFailureTitle,
} from "@/lib/workspace/publicErrors";

export function WorkspaceFailureView(props: {
  status: WorkspaceFailureStatus;
}) {
  const href =
    props.status === "Unauthenticated"
      ? "/sign-in"
      : props.status === "ActiveOrganizationRequired" ||
          props.status === "InvalidActiveOrganization"
        ? "/select-organization"
        : "/projects";

  const actionLabel =
    props.status === "Unauthenticated"
      ? "Sign in"
      : props.status === "ActiveOrganizationRequired" ||
          props.status === "InvalidActiveOrganization"
        ? "Select organization"
        : "Back to projects";

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-6 py-12">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-signal-cyan">
        Workspace
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-100">
        {workspaceFailureTitle(props.status)}
      </h1>
      <p className="mt-3 text-sm text-muted-text">
        {publicWorkspaceMessage(props.status)}
      </p>
      <Link
        href={href}
        className="mt-8 inline-flex h-9 w-fit items-center rounded-md border border-surface-border bg-surface-elevated px-4 text-sm text-slate-100"
      >
        {actionLabel}
      </Link>
    </main>
  );
}
