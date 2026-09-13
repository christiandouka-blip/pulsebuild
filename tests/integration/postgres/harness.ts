import { createHash, randomBytes } from "node:crypto";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/drizzle/schema";
import {
  evidenceItems,
  organizationMemberships,
  organizations,
  projectMemberships,
  users,
} from "@/drizzle/schema";
import { persistConstructionRecords } from "@/lib/import/persistConstruction";
import { createDrizzleIdentityDirectory } from "@/lib/db/identityDirectory";
import { createPostgresImportJobStore, createPostgresImportPersistence } from "@/lib/import/postgres";
import { createPostgresOperationalStore } from "@/lib/operations/postgres";
import { createProjectRepository } from "@/lib/repositories/projectRepository";
import { createPostgresProjectWorldSource } from "@/lib/repositories/postgresProjectWorldSource";
import { createDrizzleProjectCatalog } from "@/lib/db/projectCatalog";
import type { Database } from "@/lib/db/client";
import {
  cloneRecords,
  productionRecords,
} from "@/tests/repositories/recordsFactory";

export const LIVE_PREFIX = "org_5g_";
export const LIVE_USER_PREFIX = "user_5g_";
export const MIDWEST_PROJECT_ID = "proj-midwest-tower";
export const SITE_B_PROJECT_ID = "proj-5g-site-b";
export const CLOCK_1 = "2026-09-08T15:00:00.000Z";
export const CLOCK_2 = "2026-09-08T16:00:00.000Z";
export const CLOCK_3 = "2026-09-08T17:00:00.000Z";

export type LiveHarness = {
  runId: string;
  orgA: string;
  orgB: string;
  ownerA: string;
  viewerA: string;
  ownerB: string;
  projectA: string;
  projectB: string;
  sql: ReturnType<typeof postgres>;
  db: Database;
  directory: ReturnType<typeof createDrizzleIdentityDirectory>;
  repository: ReturnType<typeof createProjectRepository>;
  store: ReturnType<typeof createPostgresOperationalStore>;
  catalog: ReturnType<typeof createDrizzleProjectCatalog>;
  importStore: ReturnType<typeof createPostgresImportJobStore>;
  importPersistence: ReturnType<typeof createPostgresImportPersistence>;
  close: () => Promise<void>;
};

export function identity(userId: string) {
  return {
    userId,
    email: `${userId}@pulsebuild.test`,
    displayName: userId,
  };
}

export function weatherObservation() {
  return {
    signalType: "WeatherAlert" as const,
    title: "Wind advisory",
    description: "Wind affects outdoor pour window.",
    relatedEntityType: "weather",
    relatedEntityId: "wx-clear",
    relatedTaskId: "task-pour",
    payload: { condition: "Wind", severity: "moderate" },
  };
}

export function delayObservation() {
  return {
    signalType: "MaterialDeliveryDelayed" as const,
    title: "Concrete delayed",
    description: "Ready-mix ETA slipped.",
    relatedEntityType: "material",
    relatedEntityId: "mat-a",
    relatedTaskId: "task-pour",
    payload: { deliveryStatus: "delayed" },
  };
}

export function deliveryObservation() {
  return {
    signalType: "DeliveryReceived" as const,
    title: "Concrete received",
    description: "Ready-mix arrived.",
    relatedEntityType: "material",
    relatedEntityId: "mat-a",
    relatedTaskId: "task-pour",
    payload: { deliveryStatus: "received", quantityReceived: 100 },
  };
}

export function taskCompleteObservation(payload: Record<string, unknown> = {}) {
  return {
    signalType: "TaskComplete" as const,
    title: "Pour complete",
    description: "Slab pour finished.",
    relatedEntityType: "task",
    relatedEntityId: "task-pour",
    relatedTaskId: "task-pour",
    payload,
  };
}

export function createLiveSql(databaseUrl: string) {
  return postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
  });
}

export function createLiveDb(sql: ReturnType<typeof postgres>): Database {
  return drizzle(sql, { schema }) as unknown as Database;
}

export async function cleanupLiveOrganizations(
  sql: ReturnType<typeof postgres>,
): Promise<void> {
  const orgs = await sql<{ id: string }[]>`
    select id from organizations where id like ${`${LIVE_PREFIX}%`}
  `;
  if (orgs.length === 0) {
    await sql`
      delete from users where id like ${`${LIVE_USER_PREFIX}%`}
    `;
    return;
  }
  const orgIds = orgs.map((row) => row.id);
  await sql`
    delete from operational_score_snapshots where organization_id = any(${orgIds})
  `;
  await sql`
    delete from operational_timeline_events where organization_id = any(${orgIds})
  `;
  await sql`
    delete from operational_recovery_events where organization_id = any(${orgIds})
  `;
  await sql`
    delete from operational_effect_applications where organization_id = any(${orgIds})
  `;
  await sql`
    delete from operational_effects where organization_id = any(${orgIds})
  `;
  await sql`
    delete from operational_decision_transitions where organization_id = any(${orgIds})
  `;
  await sql`
    delete from operational_recommendations where organization_id = any(${orgIds})
  `;
  await sql`
    delete from operational_reasonings where organization_id = any(${orgIds})
  `;
  await sql`
    delete from operational_decisions where organization_id = any(${orgIds})
  `;
  await sql`
    delete from operational_commands where organization_id = any(${orgIds})
  `;
  await sql`
    delete from operational_observations where organization_id = any(${orgIds})
  `;
  await sql`
    delete from operational_heads where organization_id = any(${orgIds})
  `;
  await sql`
    delete from weather_event_affected_task_types
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    delete from task_required_crews
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    delete from task_required_materials
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    delete from task_required_equipment
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    delete from task_dependencies
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    delete from evidence_items
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    delete from weather_events
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    delete from inspections
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    delete from permits
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    delete from equipment
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    delete from materials
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    delete from crews
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    delete from tasks
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    update projects set current_phase_id = null where organization_id = any(${orgIds})
  `;
  await sql`
    delete from phases
    where project_id in (select id from projects where organization_id = any(${orgIds}))
  `;
  await sql`
    delete from project_import_jobs where organization_id = any(${orgIds})
  `;
  await sql`
    delete from project_memberships where organization_id = any(${orgIds})
  `;
  await sql`
    delete from projects where organization_id = any(${orgIds})
  `;
  await sql`
    delete from organization_memberships where organization_id = any(${orgIds})
  `;
  await sql`
    delete from organizations where id = any(${orgIds})
  `;
  await sql`
    delete from users where id like ${`${LIVE_USER_PREFIX}%`}
  `;
}

export async function openLiveHarness(databaseUrl: string): Promise<LiveHarness> {
  const sql = createLiveSql(databaseUrl);
  await cleanupLiveOrganizations(sql);
  const db = createLiveDb(sql);
  const runId = createHash("sha256")
    .update(randomBytes(16))
    .digest("hex")
    .slice(0, 10);
  const orgA = `${LIVE_PREFIX}a_${runId}`;
  const orgB = `${LIVE_PREFIX}b_${runId}`;
  const ownerA = `${LIVE_USER_PREFIX}owner_a_${runId}`;
  const viewerA = `${LIVE_USER_PREFIX}viewer_a_${runId}`;
  const ownerB = `${LIVE_USER_PREFIX}owner_b_${runId}`;

  await db.insert(users).values([
    { id: ownerA, name: "Owner A", email: `${ownerA}@pulsebuild.test` },
    { id: viewerA, name: "Viewer A", email: `${viewerA}@pulsebuild.test` },
    { id: ownerB, name: "Owner B", email: `${ownerB}@pulsebuild.test` },
  ]);
  await db.insert(organizations).values([
    { id: orgA, name: "Phase 5G Org A" },
    { id: orgB, name: "Phase 5G Org B" },
  ]);
  await db.insert(organizationMemberships).values([
    { id: `mem_${ownerA}`, userId: ownerA, organizationId: orgA, role: "Owner" },
    { id: `mem_${viewerA}`, userId: viewerA, organizationId: orgA, role: "Viewer" },
    { id: `mem_${ownerB}`, userId: ownerB, organizationId: orgB, role: "Owner" },
  ]);

  const midwest = cloneRecords(productionRecords(orgA));
  if (midwest.materials[0]) {
    midwest.materials[0].deliveryStatus = "delayed";
    midwest.materials[0].quantityReceived = 0;
  }
  await persistConstructionRecords(db, midwest);
  if (midwest.evidenceItems.length > 0) {
    await db.insert(evidenceItems).values(
      midwest.evidenceItems.map((item) => ({
        id: item.id,
        projectId: item.projectId,
        evidenceType: item.evidenceType,
        sourceType: item.sourceType,
        sourceRef: item.sourceRef,
        relatedEntityType: item.relatedEntityType,
        relatedEntityId: item.relatedEntityId,
        observedValue: item.observedValue,
        timestamp: new Date(item.timestamp),
        confidence: item.confidence,
      })),
    );
  }

  await persistConstructionRecords(db, {
    project: {
      id: SITE_B_PROJECT_ID,
      organizationId: orgB,
      name: "Site B",
      location: "Dallas yard",
      currentPhaseId: "phase-5g-b",
      startDate: "2026-01-01T00:00:00.000Z",
      targetDate: "2026-12-31T00:00:00.000Z",
      status: "active",
      timezone: "America/Chicago",
    },
    phases: [
      {
        id: "phase-5g-b",
        projectId: SITE_B_PROJECT_ID,
        name: "Structure",
        plannedStart: "2026-01-01T00:00:00.000Z",
        plannedEnd: "2026-08-01T00:00:00.000Z",
        status: "active",
      },
    ],
    tasks: [
      {
        id: "task-5g-b",
        projectId: SITE_B_PROJECT_ID,
        phaseId: "phase-5g-b",
        name: "Foundation",
        status: "Ready",
        taskType: "concrete",
        plannedStart: "2026-03-01T08:00:00.000Z",
        plannedEnd: "2026-03-01T17:00:00.000Z",
        priorityWeight: 8,
        isCriticalPath: true,
        actualStart: null,
        actualEnd: null,
      },
    ],
    crews: [],
    materials: [],
    equipment: [],
    inspections: [],
    permits: [],
    weatherEvents: [],
    evidenceItems: [],
    taskDependencies: [],
    taskRequiredCrews: [],
    taskRequiredMaterials: [],
    taskRequiredEquipment: [],
    weatherAffectedTaskTypes: [],
  });

  await db.insert(projectMemberships).values({
    id: `pmem_${viewerA}`,
    userId: viewerA,
    organizationId: orgA,
    projectId: MIDWEST_PROJECT_ID,
  });

  return {
    runId,
    orgA,
    orgB,
    ownerA,
    viewerA,
    ownerB,
    projectA: MIDWEST_PROJECT_ID,
    projectB: SITE_B_PROJECT_ID,
    sql,
    db,
    directory: createDrizzleIdentityDirectory(db),
    repository: createProjectRepository(createPostgresProjectWorldSource(db)),
    store: createPostgresOperationalStore(db),
    catalog: createDrizzleProjectCatalog(db),
    importStore: createPostgresImportJobStore(db),
    importPersistence: createPostgresImportPersistence(db),
    close: async () => {
      await cleanupLiveOrganizations(sql);
      await sql.end({ timeout: 5 });
    },
  };
}

export async function countScopedRows(
  sql: ReturnType<typeof postgres>,
  organizationId: string,
  projectId: string,
) {
  const [head] = await sql<{ n: number }[]>`
    select count(*)::int as n from operational_heads
    where organization_id = ${organizationId} and project_id = ${projectId}
  `;
  const [observations] = await sql<{ n: number }[]>`
    select count(*)::int as n from operational_observations
    where organization_id = ${organizationId} and project_id = ${projectId}
  `;
  const [commands] = await sql<{ n: number }[]>`
    select count(*)::int as n from operational_commands
    where organization_id = ${organizationId} and project_id = ${projectId}
  `;
  const [transitions] = await sql<{ n: number }[]>`
    select count(*)::int as n from operational_decision_transitions
    where organization_id = ${organizationId} and project_id = ${projectId}
  `;
  const [effects] = await sql<{ n: number }[]>`
    select count(*)::int as n from operational_effects
    where organization_id = ${organizationId} and project_id = ${projectId}
  `;
  const [applications] = await sql<{ n: number }[]>`
    select count(*)::int as n from operational_effect_applications
    where organization_id = ${organizationId} and project_id = ${projectId}
  `;
  const [recovery] = await sql<{ n: number }[]>`
    select count(*)::int as n from operational_recovery_events
    where organization_id = ${organizationId} and project_id = ${projectId}
  `;
  const [timeline] = await sql<{ n: number }[]>`
    select count(*)::int as n from operational_timeline_events
    where organization_id = ${organizationId} and project_id = ${projectId}
  `;
  return {
    heads: head?.n ?? 0,
    observations: observations?.n ?? 0,
    commands: commands?.n ?? 0,
    transitions: transitions?.n ?? 0,
    effects: effects?.n ?? 0,
    applications: applications?.n ?? 0,
    recovery: recovery?.n ?? 0,
    timeline: timeline?.n ?? 0,
  };
}
