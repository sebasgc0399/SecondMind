import type { AreaKey } from '@/types/area';
import type { Priority } from '@/types/common';

export type InboxSource =
  | 'quick-capture'
  | 'web-clip'
  | 'desktop-capture'
  | 'voice'
  | 'share-intent'
  | 'email';

export type InboxStatus = 'pending' | 'processed' | 'dismissed';

export type InboxResultType = 'task' | 'note' | 'project' | 'trash';

export interface InboxAiResult {
  suggestedTitle: string;
  suggestedTags: string[];
  suggestedType: InboxResultType;
  suggestedArea: AreaKey;
  summary: string;
  priority: Priority;
  relatedNoteIds: string[];
}

export interface InboxProcessedAs {
  type: 'note' | 'task' | 'project';
  resultId: string;
}

export interface InboxItem {
  id: string;
  rawContent: string;
  source: InboxSource;
  sourceUrl?: string;
  aiProcessed: boolean;
  aiResult?: InboxAiResult;
  status: InboxStatus;
  processedAs?: InboxProcessedAs;
  createdAt: number;
}

export interface ConvertOverrides {
  title?: string;
  area?: AreaKey;
  priority?: Priority;
  tags?: string[];
}
