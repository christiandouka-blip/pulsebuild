import type { ProjectStatus } from "@/domain/types/project";
import type { AccessibleProject, ProjectCatalog } from "@/lib/workspace/types";

export class MemoryProjectCatalog implements ProjectCatalog {
  projects: AccessibleProject[] = [];
  assignments: Array<{
    userId: string;
    projectId: string;
    organizationId: string;
  }> = [];

  addProject(input: {
    id: string;
    organizationId: string;
    name: string;
    status?: ProjectStatus;
  }): void {
    this.projects.push({
      id: input.id,
      organizationId: input.organizationId,
      name: input.name,
      status: input.status ?? "active",
    });
  }

  async listOrganizationProjects(
    organizationId: string,
  ): Promise<readonly AccessibleProject[]> {
    return this.projects
      .filter((project) => project.organizationId === organizationId)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  async listAssignedProjects(input: {
    userId: string;
    organizationId: string;
  }): Promise<readonly AccessibleProject[]> {
    const assigned = new Set(
      this.assignments
        .filter(
          (row) =>
            row.userId === input.userId &&
            row.organizationId === input.organizationId,
        )
        .map((row) => row.projectId),
    );
    return this.projects
      .filter(
        (project) =>
          project.organizationId === input.organizationId &&
          assigned.has(project.id),
      )
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }
}
