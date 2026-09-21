import { ORGANIZATION_ROLES } from "@/domain/tenancy/types";

import type { OperatorProvisionInput, ProvisioningRole } from "@/lib/provisioning/types";

const FLAG_WITH_VALUE = new Set([
  "--user-id",
  "--email",
  "--role",
  "--organization-id",
  "--organization-name",
  "--project-id",
  "--confirm",
]);

const BOOLEAN_FLAGS = new Set([
  "--create-organization",
  "--apply",
  "--help",
]);

export type ParsedOperatorArgs =
  | { status: "help" }
  | { status: "ok"; input: OperatorProvisionInput }
  | { status: "rejected"; message: string };

export function parseOperatorArgs(argv: readonly string[]): ParsedOperatorArgs {
  const values: Record<string, string> = {};
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      return {
        status: "rejected",
        message: `Unexpected argument "${token}".`,
      };
    }
    if (BOOLEAN_FLAGS.has(token)) {
      flags.add(token);
      continue;
    }
    if (!FLAG_WITH_VALUE.has(token)) {
      return {
        status: "rejected",
        message: `Unknown flag "${token}".`,
      };
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      return {
        status: "rejected",
        message: `${token} requires a value.`,
      };
    }
    values[token] = value;
    index += 1;
  }

  if (flags.has("--help")) {
    return { status: "help" };
  }

  const role = values["--role"];
  if (!role) {
    return { status: "rejected", message: "--role is required." };
  }
  if (!ORGANIZATION_ROLES.includes(role as ProvisioningRole)) {
    return {
      status: "rejected",
      message: '--role must be Owner, ProjectManager, Superintendent, or Viewer.',
    };
  }

  return {
    status: "ok",
    input: {
      userId: values["--user-id"],
      email: values["--email"],
      role: role as ProvisioningRole,
      organizationId: values["--organization-id"],
      organizationName: values["--organization-name"],
      createOrganization: flags.has("--create-organization"),
      projectId: values["--project-id"],
      apply: flags.has("--apply"),
      confirmOrganizationId: values["--confirm"],
    },
  };
}

export function operatorProvisioningHelp(): string {
  return [
    "PulseBuild operator provisioning (Phase 5H.2)",
    "",
    "Assign an existing Auth.js user to an organization with an explicit role.",
    "Dry-run is the default. Pass --apply --confirm <organization-id> to mutate.",
    "",
    "Identify the user with exactly one of --user-id or --email, or both when",
    "they refer to the same user. Users are not created here.",
    "",
    "Bootstrap an organization with:",
    "  --create-organization --organization-id <id> --organization-name <name>",
    "",
    "Owner does not use project membership. Non-Owner project assignment is",
    "optional and must use --project-id in the same organization.",
    "",
    "Example (placeholders only):",
    "  npm run provision:operator -- --user-id <USER_ID> --role Owner \\",
    "    --create-organization --organization-id <ORG_ID> \\",
    "    --organization-name <ORG_NAME>",
    "  npm run provision:operator -- --user-id <USER_ID> --role Owner \\",
    "    --organization-id <ORG_ID> --apply --confirm <ORG_ID>",
  ].join("\n");
}
