import type { Priority, ProjectStatus } from '@/types/common';

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  priority: Priority;
  areaId: string;
  objectiveId: string;
  taskIds: string[];
  noteIds: string[];
  startDate: number;
  deadline: number;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}
