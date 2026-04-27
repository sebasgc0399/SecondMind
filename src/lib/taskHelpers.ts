import { startOfDay } from '@/lib/formatDate';
import type { Task } from '@/types/task';

export function isOverdue(task: Task): boolean {
  if (task.status === 'completed' || task.dueDate === 0) return false;
  return task.dueDate < startOfDay(Date.now());
}
