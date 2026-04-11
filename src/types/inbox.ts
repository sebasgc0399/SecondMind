export type InboxSource = 'quick-capture' | 'web-clip' | 'voice' | 'share-intent' | 'email';

export type InboxStatus = 'pending' | 'processed' | 'dismissed';

export type InboxResultType = 'task' | 'note' | 'project' | 'reference' | 'trash';

export interface InboxAiResult {
  suggestedTitle: string;
  suggestedTags: string[];
  suggestedType: InboxResultType;
  summary: string;
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
