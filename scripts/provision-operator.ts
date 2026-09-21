import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/drizzle/schema";
import { isProductionRuntime } from "@/lib/auth/runtimeMode";
import { getDatabaseUrl } from "@/lib/db/client";
import { provisionOperator } from "@/lib/provisioning/operatorProvisioning";
import {
  operatorProvisioningHelp,
  parseOperatorArgs,
} from "@/lib/provisioning/parseArgs";
import { createPostgresProvisioningStore } from "@/lib/provisioning/postgresStore";

function printPlan(result: Awaited<ReturnType<typeof provisionOperator>>) {
  if (result.status === "rejected") {
    console.error(`Rejected: ${result.code}`);
    console.error(result.message);
    return;
  }

  console.log(result.applied ? "Applied" : "Dry-run");
  console.log(`userId=${result.userId}`);
  console.log(`organizationId=${result.organizationId}`);
  console.log(`role=${result.role}`);
  console.log(`idempotent=${result.idempotent ? "yes" : "no"}`);
  if (result.changes.length === 0) {
    console.log("changes=none");
  } else {
    for (const change of result.changes) {
      if (change.kind === "create_organization") {
        console.log(
          `change=create_organization id=${change.organizationId} name=${change.name}`,
        );
      }
      if (change.kind === "create_organization_membership") {
        console.log(
          `change=create_organization_membership id=${change.membershipId} role=${change.role}`,
        );
      }
      if (change.kind === "create_project_membership") {
        console.log(
          `change=create_project_membership id=${change.membershipId} projectId=${change.projectId}`,
        );
      }
    }
  }
  for (const note of result.notes) {
    console.log(`note=${note}`);
  }
}

async function main() {
  const parsed = parseOperatorArgs(process.argv.slice(2));
  if (parsed.status === "help") {
    console.log(operatorProvisioningHelp());
    return;
  }
  if (parsed.status === "rejected") {
    console.error(parsed.message);
    console.error("Pass --help for usage.");
    process.exitCode = 1;
    return;
  }

  if (!isProductionRuntime()) {
    console.error(
      "Operator provisioning requires PULSEBUILD_RUNTIME_MODE=production.",
    );
    process.exitCode = 1;
    return;
  }

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required for operator provisioning.");
    process.exitCode = 1;
    return;
  }

  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 20 });
  try {
    const db = drizzle(sql, { schema });
    const store = createPostgresProvisioningStore(db);
    const result = await provisionOperator(store, parsed.input);
    printPlan(result);
    if (result.status === "rejected") {
      process.exitCode = 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch(() => {
  console.error("Operator provisioning failed.");
  process.exitCode = 1;
});
