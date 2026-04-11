export type LinkType = 'explicit' | 'ai-suggested';

export interface NoteLink {
  id: string;
  sourceId: string;
  targetId: string;
  context?: string;
  linkType: LinkType;
  sourceTitle: string;
  targetTitle: string;
  createdAt: number;
  strength?: number;
  accepted: boolean;
}
