export interface AiAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: string; // Base64 or data URL
}

export interface AiStep {
  id: string;
  label: string;
  detail?: string;
  status: 'running' | 'completed' | 'queued';
  timestamp: number;
}

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  suggestedCode?: string | null;
  suggestedFiles?: Array<{ title: string; code: string; isCreated?: boolean }>;
  surgicalCommand?: {
    type: 'REPLACE_SECTION' | 'INSERT_BEFORE_SECTION' | 'INSERT_AFTER_SECTION' | 'APPEND_TO_SECTION' | 'INSERT_AT_END' | 'REPLACE_BLOCK' | 'DELETE_BLOCK' | 'REWRITE';
    targetId?: string;
  } | null;
  isTargetedEdit?: boolean;
  selectedText?: string | null;
  attachments?: AiAttachment[];
  steps?: AiStep[];
  actionBadge?: {
    label: string;
    sublabel?: string;
    actionType?: string;
    targetId?: string;
    status?: 'proposed' | 'applied';
  };
  isApplied?: boolean;
  timestamp: number;
}
