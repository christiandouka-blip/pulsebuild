import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { publicAuthorizationMessage } from "@/domain/authorization/types";
import { validateHarborPointSeedSnapshot } from "@/domain/validation/validateHarborPointSeedSnapshot";
import { validateProjectSnapshot } from "@/domain/validation/validateProjectSnapshot";
import { createFixedClock } from "@/lib/import/clock";
import { MemoryImportBackend } from "@/lib/import/memoryBackend";
import {
  confirmImportJob,
  createParsedImportJob,
} from "@/lib/import/service";
import {
  ensureCommandCenterInitialized,
  hydrateWorkspaceSnapshot,
  processNextObservationCommitted,
} from "@/lib/orchestration/commandCenter";
import { createProjectRepository } from "@/lib/repositories/projectRepository";
import { useProjectStore } from "@/store/useProjectStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useSimulatedClockStore } from "@/store/useSimulatedClockStore";
import {
  makeMembership,
  makeUser,
  MemoryIdentityDirectory,
} from "@/tests/auth/memoryDirectory";
import {
  IMPORT_CLOCK,
  ownerAuth,
  sheetsToCsv,
  VALID_SETUP,
  validSheets,
} from "@/tests/import/fixtures";
import {
  cloneRecords,
  HARBOR_POINT_PROJECT_ID,
  productionRecords,
} from "@/tests/repositories/recordsFactory";
import {
  createMemoryProjectWorldSource,
  createThrowingProjectWorldSource,
} from "@/tests/repositories/memoryWorldSource";
import { listAuthorizedWorkspaceProjects } from "@/lib/workspace/listProjects";
import { loadProductionWorkspace } from "@/lib/workspace/loadWorkspace";
import { createProductionWorkspacePorts } from "@/lib/workspace/productionPorts";
import { publicWorkspaceMessage } from "@/lib/workspace/publicErrors";
import { MemoryProjectCatalog } from "@/tests/workspace/memoryCatalog";

const ORG_A = "org-a";
const ORG_B = "org-b";
const PROJECT_A = "proj-midwest-tower";
const PROJECT_UNASSIGNED = "proj-unassigned";
const PROJECT_B = "proj-org-b";
const OPERATIONAL_AT = "2026-09-08T15:00:00.000Z";

function identity(userId: string) {
  return { userId, email: `${userId}@pulsebuild.test`, displayName: userId };
}

function csvBytes() {
  return new TextEncoder().encode(sheetsToCsv(validSheets()));
}

async function setupWorld() {
  const directory = new MemoryIdentityDirectory();
  const catalog = new MemoryProjectCatalog();
  const recordsA = productionRecords(ORG_A);

  directory.users.set("owner-a", makeUser("owner-a", "owner-a@pulsebuild.test"));
  directory.users.set("pm-a", makeUser("pm-a", "pm-a@pulsebuild.test"));
  directory.users.set("super-a", makeUser("super-a", "super-a@pulsebuild.test"));
  directory.users.set("viewer-a", makeUser("viewer-a", "viewer-a@pulsebuild.test"));
  directory.memberships.push(
    makeMembership("owner-a", ORG_A, "Owner"),
    makeMembership("pm-a", ORG_A, "ProjectManager"),
    makeMembership("super-a", ORG_A, "Superintendent"),
    makeMembership("viewer-a", ORG_A, "Viewer"),
  );
  directory.projects.push(
    { id: PROJECT_A, organizationId: ORG_A },
    { id: PROJECT_UNASSIGNED, organizationId: ORG_A },
    { id: PROJECT_B, organizationId: ORG_B },
  );
  directory.assignments.push(
    { userId: "pm-a", projectId: PROJECT_A, organizationId: ORG_A },
    { userId: "super-a", projectId: PROJECT_A, organizationId: ORG_A },
    { userId: "viewer-a", projectId: PROJECT_A, organizationId: ORG_A },
  );

  catalog.addProject({
    id: PROJECT_A,
    organizationId: ORG_A,
    name: recordsA.project.name,
  });
  catalog.addProject({
    id: PROJECT_UNASSIGNED,
    organizationId: ORG_A,
    name: "Unassigned Yard",
  });
  catalog.addProject({
    id: PROJECT_B,
    organizationId: ORG_B,
    name: "Other Org Tower",
  });
  catalog.assignments = [...directory.assignments];

  const repository = createProjectRepository(
    createMemoryProjectWorldSource([recordsA]),
  );
  const clock = createFixedClock(OPERATIONAL_AT);

  return { directory, catalog, repository, clock, recordsA };
}

function resetWorkspaceStores() {
  useProjectStore.setState({
    snapshot: null,
    isLoaded: false,
    source: "demo",
    operational: null,
  });
  useReasoningStore.setState({ isInitialized: false });
  useReasoningStore.getState().resetReasoning();
  useReasoningStore.setState({ isInitialized: false });
  useSimulatedClockStore.setState({ clock: null, timeAuthority: "simulated" });
}

describe("Phase 5E project listing", () => {
  it("lets Owner see authorized organization projects", async () => {
    const { directory, catalog } = await setupWorld();
    const listed = await listAuthorizedWorkspaceProjects({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      directory,
      catalog,
    });
    expect(listed.status).toBe("Listed");
    if (listed.status !== "Listed") return;
    expect(listed.projects.map((project) => project.id).sort()).toEqual(
      [PROJECT_A, PROJECT_UNASSIGNED].sort(),
    );
    expect(listed.projects.some((project) => project.id === PROJECT_B)).toBe(false);
  });

  it("lets ProjectManager see only assigned projects", async () => {
    const { directory, catalog } = await setupWorld();
    const listed = await listAuthorizedWorkspaceProjects({
      identity: identity("pm-a"),
      requestedOrganizationId: ORG_A,
      directory,
      catalog,
    });
    expect(listed.status).toBe("Listed");
    if (listed.status !== "Listed") return;
    expect(listed.projects.map((project) => project.id)).toEqual([PROJECT_A]);
  });

  it("lets Superintendent see only assigned projects", async () => {
    const { directory, catalog } = await setupWorld();
    const listed = await listAuthorizedWorkspaceProjects({
      identity: identity("super-a"),
      requestedOrganizationId: ORG_A,
      directory,
      catalog,
    });
    expect(listed.status).toBe("Listed");
    if (listed.status !== "Listed") return;
    expect(listed.projects.map((project) => project.id)).toEqual([PROJECT_A]);
  });

  it("lets Viewer see only assigned projects", async () => {
    const { directory, catalog } = await setupWorld();
    const listed = await listAuthorizedWorkspaceProjects({
      identity: identity("viewer-a"),
      requestedOrganizationId: ORG_A,
      directory,
      catalog,
    });
    expect(listed.status).toBe("Listed");
    if (listed.status !== "Listed") return;
    expect(listed.projects.map((project) => project.id)).toEqual([PROJECT_A]);
  });

  it("keeps production project selection tenant-scoped", async () => {
    const { directory, catalog } = await setupWorld();
    const listed = await listAuthorizedWorkspaceProjects({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      directory,
      catalog,
    });
    expect(listed.status).toBe("Listed");
    if (listed.status !== "Listed") return;
    expect(
      listed.projects.every((project) => project.organizationId === ORG_A),
    ).toBe(true);
  });
});

describe("Phase 5E workspace load", () => {
  afterEach(() => {
    resetWorkspaceStores();
    vi.restoreAllMocks();
  });

  it("fails closed on cross-tenant project ids without disclosing existence", async () => {
    const { directory, repository, clock } = await setupWorld();
    const result = await loadProductionWorkspace({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_B,
      directory,
      repository,
      clock,
    });
    expect(result.status).toBe("ProjectNotFound");
    expect(publicWorkspaceMessage("ProjectNotFound")).toBe(
      publicAuthorizationMessage({ status: "ProjectAccessDenied" }),
    );
    expect(publicWorkspaceMessage("ProjectNotFound")).not.toContain(ORG_B);
    expect(publicWorkspaceMessage("ProjectNotFound")).not.toContain(PROJECT_B);
  });

  it("does not disclose unauthorized same-org project existence", async () => {
    const { directory, repository, clock } = await setupWorld();
    const result = await loadProductionWorkspace({
      identity: identity("pm-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_UNASSIGNED,
      directory,
      repository,
      clock,
    });
    expect(result.status).toBe("ProjectAccessDenied");
    expect(publicWorkspaceMessage("ProjectAccessDenied")).toBe(
      publicWorkspaceMessage("ProjectNotFound"),
    );
  });

  it("loads production workspace through ProjectRepository", async () => {
    const { directory, repository, clock, recordsA } = await setupWorld();
    const result = await loadProductionWorkspace({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      directory,
      repository,
      clock,
    });
    expect(result.status).toBe("Loaded");
    if (result.status !== "Loaded") return;
    expect(result.snapshot.project.id).toBe(recordsA.project.id);
    expect(result.snapshot.project.id).not.toBe(HARBOR_POINT_PROJECT_ID);
    expect(validateProjectSnapshot(result.snapshot).ok).toBe(true);
    expect(result.snapshot.scenarioFixtures).toEqual([]);
    expect(validateHarborPointSeedSnapshot(result.snapshot).ok).toBe(false);
    expect(result.currentOperationalAt).toBe(OPERATIONAL_AT);
    expect(result.snapshot.project.currentSimulatedAt).toBe(OPERATIONAL_AT);
  });

  it("hydrates Command Center from the PostgreSQL-backed snapshot", async () => {
    const { directory, repository, clock } = await setupWorld();
    const result = await loadProductionWorkspace({
      identity: identity("pm-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      directory,
      repository,
      clock,
    });
    expect(result.status).toBe("Loaded");
    if (result.status !== "Loaded") return;
    hydrateWorkspaceSnapshot(result.snapshot);
    expect(useProjectStore.getState().source).toBe("workspace");
    expect(useProjectStore.getState().snapshot?.project.id).toBe(PROJECT_A);
    expect(useProjectStore.getState().snapshot?.scenarioFixtures).toEqual([]);
    expect(useSimulatedClockStore.getState().timeAuthority).toBe("operational");
    expect(useSimulatedClockStore.getState().peekNext()).toBe(OPERATIONAL_AT);
    expect(useReasoningStore.getState().canProcessNext).toBe(false);
    const next = processNextObservationCommitted();
    expect(next.ok).toBe(false);
    expect(useSimulatedClockStore.getState().peekNext()).toBe(OPERATIONAL_AT);
    expect(useProjectStore.getState().snapshot?.project.id).not.toBe(
      HARBOR_POINT_PROJECT_ID,
    );
  });

  it("lets imported projects enter the production workspace path", async () => {
    const backend = new MemoryImportBackend();
    const directory = new MemoryIdentityDirectory();
    const catalog = new MemoryProjectCatalog();
    directory.users.set("owner-a", makeUser("owner-a", "owner-a@pulsebuild.test"));
    directory.memberships.push(makeMembership("owner-a", ORG_A, "Owner"));
    const created = await createParsedImportJob({
      authorization: ownerAuth(),
      setup: VALID_SETUP,
      filename: "job.csv",
      bytes: csvBytes(),
      clock: createFixedClock(IMPORT_CLOCK),
      store: backend,
    });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;
    const confirmed = await confirmImportJob({
      authorization: ownerAuth(),
      importId: created.job.id,
      acknowledgeWarnings: true,
      clock: createFixedClock(IMPORT_CLOCK),
      store: backend,
      persistence: backend,
    });
    expect(confirmed.status).toBe("Imported");
    if (confirmed.status !== "Imported") return;
    const records = [...backend.projects.values()][0];
    expect(records).toBeDefined();
    directory.projects.push({
      id: records.project.id,
      organizationId: ORG_A,
    });
    catalog.addProject({
      id: records.project.id,
      organizationId: ORG_A,
      name: records.project.name,
    });
    const listed = await listAuthorizedWorkspaceProjects({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      directory,
      catalog,
    });
    expect(listed.status).toBe("Listed");
    if (listed.status !== "Listed") return;
    expect(listed.projects.some((project) => project.id === records.project.id)).toBe(
      true,
    );
    const loaded = await loadProductionWorkspace({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: records.project.id,
      directory,
      repository: createProjectRepository(
        createMemoryProjectWorldSource([records]),
      ),
      clock: createFixedClock(IMPORT_CLOCK),
    });
    expect(loaded.status).toBe("Loaded");
    if (loaded.status !== "Loaded") return;
    expect(loaded.snapshot.scenarioFixtures).toEqual([]);
    expect(validateProjectSnapshot(loaded.snapshot).ok).toBe(true);
    expect(loaded.snapshot.project.id).not.toBe(HARBOR_POINT_PROJECT_ID);
  });

  it("returns an explicit failure when the repository/database is unavailable", async () => {
    const { directory, clock } = await setupWorld();
    const result = await loadProductionWorkspace({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      directory,
      repository: createProjectRepository(createThrowingProjectWorldSource()),
      clock,
    });
    expect(result.status).toBe("DatabaseUnavailable");
    expect(publicWorkspaceMessage("DatabaseUnavailable")).not.toContain("SQL");
    expect(publicWorkspaceMessage("DatabaseUnavailable")).not.toContain(
      "connection refused",
    );
  });

  it("returns an explicit failure for invalid project data", async () => {
    const { directory, clock } = await setupWorld();
    const invalid = cloneRecords(productionRecords(ORG_A));
    invalid.project.currentPhaseId = "missing-phase";
    const result = await loadProductionWorkspace({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_A,
      directory,
      repository: createProjectRepository(
        createMemoryProjectWorldSource([invalid]),
      ),
      clock,
    });
    expect(result.status).toBe("InvalidProjectData");
    expect("snapshot" in result).toBe(false);
  });

  it("never loads Harbor Point after a production failure", async () => {
    const { directory, clock } = await setupWorld();
    await loadProductionWorkspace({
      identity: identity("owner-a"),
      requestedOrganizationId: ORG_A,
      projectId: PROJECT_B,
      directory,
      repository: createProjectRepository(createThrowingProjectWorldSource()),
      clock,
    });
    useProjectStore.setState({
      snapshot: null,
      isLoaded: false,
      source: "workspace",
      operational: null,
    });
    expect(() => ensureCommandCenterInitialized()).toThrow(
      /Workspace snapshot is not loaded/,
    );
    expect(useProjectStore.getState().snapshot).toBeNull();
    expect(useProjectStore.getState().source).toBe("workspace");
    expect(useProjectStore.getState().snapshot?.project.id).not.toBe(
      HARBOR_POINT_PROJECT_ID,
    );
  });

  it("still loads Harbor Point on the demo runtime path", () => {
    useProjectStore.getState().loadSeedProject();
    const snapshot = ensureCommandCenterInitialized();
    expect(snapshot.project.id).toBe(HARBOR_POINT_PROJECT_ID);
    expect(snapshot.scenarioFixtures).toHaveLength(5);
    expect(validateHarborPointSeedSnapshot(snapshot).ok).toBe(true);
    expect(useProjectStore.getState().source).toBe("demo");
    expect(useSimulatedClockStore.getState().timeAuthority).toBe("simulated");
  });
});

describe("Phase 5E source boundaries", () => {
  it("does not move authorization authority into the client store", () => {
    for (const file of [
      "store/useProjectStore.ts",
      "store/useReasoningStore.ts",
      "store/useDecisionStore.ts",
      "store/useSimulatedClockStore.ts",
      "components/command-center/CommandCenterShell.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source.includes("authorizeProjectRequest")).toBe(false);
      expect(source.includes("authorizeOrganizationContext")).toBe(false);
      expect(source.includes("@/lib/db")).toBe(false);
      expect(source.includes("DATABASE_URL")).toBe(false);
      expect(source.includes("localStorage")).toBe(false);
    }
  });

  it("keeps production workspace loading off the Harbor Point seed", () => {
    for (const file of [
      "lib/workspace/loadWorkspace.ts",
      "lib/workspace/listProjects.ts",
      "lib/workspace/productionPorts.ts",
      "lib/db/projectCatalog.ts",
      "app/projects/page.tsx",
      "app/projects/[projectId]/page.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source.includes("getInitialProjectSnapshot")).toBe(false);
      expect(source.includes("validateHarborPointSeedSnapshot")).toBe(false);
      expect(source.includes("proj-harbor-point")).toBe(false);
      expect(source.includes("loadSeedProject")).toBe(false);
      expect(source.includes("createDemoProjectRepository")).toBe(false);
    }
  });

  it("routes demo Command Center to Harbor Point and production to /projects", () => {
    const home = readFileSync("app/page.tsx", "utf8");
    expect(home.includes("CommandCenterShell")).toBe(true);
    expect(home.includes('redirect("/projects")')).toBe(true);
    expect(home.includes("isProductionRuntime")).toBe(true);
    const list = readFileSync("app/projects/page.tsx", "utf8");
    expect(list.includes("listAuthorizedWorkspaceProjects")).toBe(true);
    const workspace = readFileSync("app/projects/[projectId]/page.tsx", "utf8");
    expect(workspace.includes("loadProductionWorkspace")).toBe(true);
    expect(workspace.includes("workspaceSnapshot")).toBe(true);
    expect(workspace.includes("getInitialProjectSnapshot")).toBe(false);
  });

  it("does not treat a missing database as Harbor Point", () => {
    const ports = createProductionWorkspacePorts();
    expect(ports.status).toBe("DatabaseUnavailable");
  });
});
