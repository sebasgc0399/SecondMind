import type { ObjectiveStatus } from '@/types/common';

export interface Objective {
  id: string;
  name: string;
  status: ObjectiveStatus;
  deadline: number;
  areaId: string;
  projectIds: string[];
  taskIds: string[];
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}
