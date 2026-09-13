import { errorCount, warningCount } from "@/domain/import/issues";
import type {
  ImportIssue,
  NormalizedProjectImport,
  ProjectImportPreview,
} from "@/domain/import/types";

export function buildImportPreview(
  staging: NormalizedProjectImport,
  issues: ImportIssue[],
  selectedCurrentPhaseExternalId?: string | null,
): ProjectImportPreview {
  return {
    projectName: staging.project.name,
    timezone: staging.project.timezone,
    phaseCount: staging.phases.length,
    taskCount: staging.tasks.length,
    crewCount: staging.crews.length,
    materialCount: staging.materials.length,
    equipmentCount: staging.equipment.length,
    inspectionCount: staging.inspections.length,
    permitCount: staging.permits.length,
    weatherCount: staging.weather.length,
    criticalPathCount: staging.tasks.filter((task) => task.isCriticalPath).length,
    errorCount: errorCount(issues),
    warningCount: warningCount(issues),
    issues,
    phaseOptions: staging.phases.map((phase) => ({
      externalId: phase.externalId,
      name: phase.name,
    })),
    selectedCurrentPhaseExternalId: selectedCurrentPhaseExternalId ?? undefined,
  };
}
