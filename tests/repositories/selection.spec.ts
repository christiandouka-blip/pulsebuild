import { describe, expect, it } from "vitest";

import { createDemoProjectRepository } from "@/lib/repositories/demoProjectRepository";
import { createPostgresProjectRepository } from "@/lib/repositories/postgresProjectWorldSource";
import { selectProjectRepository } from "@/lib/repositories/selectProjectRepository";
import {
  ACTOR_USER_ID,
  HARBOR_POINT_OPERATIONAL_AT,
  HARBOR_POINT_ORGANIZATION_ID,
  HARBOR_POINT_PROJECT_ID,
  OTHER_ORGANIZATION_ID,
} from "@/tests/repositories/recordsFactory";

const demoInput = {
  tenantScope: {
    organizationId: OTHER_ORGANIZATION_ID,
    actorUserId: ACTOR_USER_ID,
  },
  projectId: "proj-not-harbor-point",
  currentOperationalAt: HARBOR_POINT_OPERATIONAL_AT,
};

describe("repository selection", () => {
  it("selects the demo repository without DATABASE_URL", async () => {
    const repository = selectProjectRepository({
      PULSEBUILD_RUNTIME_MODE: "demo",
    });
    const result = await repository.loadProjectSnapshot(demoInput);
    expect(result.status).toBe("Loaded");
    if (result.status === "Loaded") {
      expect(result.snapshot.project.id).toBe(HARBOR_POINT_PROJECT_ID);
      expect(result.snapshot.scenarioFixtures).toHaveLength(5);
    }
  });

  it("lets the demo repository ignore tenant scope", async () => {
    const repository = createDemoProjectRepository();
    const result = await repository.loadProjectSnapshot(demoInput);
    expect(result.status).toBe("Loaded");
    if (result.status === "Loaded") {
      expect(result.snapshot.project.id).toBe(HARBOR_POINT_PROJECT_ID);
    }
  });

  it("selects the production repository in production mode", async () => {
    const repository = selectProjectRepository({
      PULSEBUILD_RUNTIME_MODE: "production",
    });
    const result = await repository.loadProjectSnapshot({
      tenantScope: {
        organizationId: HARBOR_POINT_ORGANIZATION_ID,
        actorUserId: ACTOR_USER_ID,
      },
      projectId: HARBOR_POINT_PROJECT_ID,
      currentOperationalAt: HARBOR_POINT_OPERATIONAL_AT,
    });
    expect(result.status).toBe("DatabaseUnavailable");
  });

  it("does not fall back to Harbor Point when production data is missing", async () => {
    const repository = createPostgresProjectRepository({
      PULSEBUILD_RUNTIME_MODE: "production",
    });
    const result = await repository.loadProjectSnapshot({
      tenantScope: {
        organizationId: HARBOR_POINT_ORGANIZATION_ID,
        actorUserId: ACTOR_USER_ID,
      },
      projectId: HARBOR_POINT_PROJECT_ID,
      currentOperationalAt: HARBOR_POINT_OPERATIONAL_AT,
    });
    expect(result.status).toBe("DatabaseUnavailable");
    if (result.status === "DatabaseUnavailable") {
      expect(result.message).toBe("Project database is unavailable");
    }
  });
});
