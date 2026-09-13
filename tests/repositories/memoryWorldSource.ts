import type {
  ProjectConstructionRecords,
  ProjectWorldSource,
} from "@/lib/repositories/types";

export function createMemoryProjectWorldSource(
  records: ProjectConstructionRecords[],
): ProjectWorldSource {
  return {
    async loadProjectWorld(input) {
      return (
        records.find(
          (item) =>
            item.project.id === input.projectId &&
            item.project.organizationId === input.organizationId,
        ) ?? null
      );
    },
  };
}

export function createThrowingProjectWorldSource(
  error: Error = new Error("connection refused"),
): ProjectWorldSource {
  return {
    async loadProjectWorld() {
      throw error;
    },
  };
}
