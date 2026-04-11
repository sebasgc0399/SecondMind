import type { Priority, TaskStatus } from '@/types/common';

export interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: number;
  projectId: string;
  areaId: string;
  objectiveId: string;
  noteIds: string[];
  description: string;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt: number;
}
