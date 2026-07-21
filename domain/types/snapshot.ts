import type { EvidenceItem } from "@/domain/types/evidence";
import type { Phase, Project } from "@/domain/types/project";
import type {
  Crew,
  Equipment,
  Inspection,
  Material,
  Permit,
  WeatherEvent,
} from "@/domain/types/resources";
import type { ScenarioFixture } from "@/domain/types/signal";
import type { Task } from "@/domain/types/task";

/** Construction-world source data only — PO Decision 13. */
export type ProjectSnapshot = {
  project: Project;
  phases: Phase[];
  tasks: Task[];
  crews: Crew[];
  materials: Material[];
  equipment: Equipment[];
  inspections: Inspection[];
  permits: Permit[];
  weather: WeatherEvent[];
  evidence: EvidenceItem[];
  scenarioFixtures: ScenarioFixture[];
};
