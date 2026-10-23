export { type HtmlProject, type HtmlNoteItem } from '../../lib/htmlNotesSync';

export interface EditorSearchMatch {
  lineIdx: number;
  start: number;
  end: number;
}

export interface DocumentHeading {
  id: string;
  level: number;
  text: string;
  index?: number;
  pageIndex?: number;
  lineIndex?: number;
}

export interface HtmlNotesStudioProps {
  onBack: () => void;
  isDarkMode?: boolean;
  toggleTheme?: () => void;
  activeStudioMode?: 'notes' | 'repository' | 'html';
  onSwitchStudioMode?: (mode: 'notes' | 'repository' | 'html') => void;
  onRegisterActions?: (actions: { 
    onCreateNewProject: () => void; 
    onImportClick: () => void; 
    onAddFileToProject?: (projectId?: string) => void;
  }) => void;
  onViewChange?: (view: 'home' | 'editor') => void;
}

export type ViewMode = 'split' | 'editor' | 'preview';
export type ViewportMode = 'slide' | 'a4' | 'desktop' | 'tablet' | 'mobile';
export type ActiveTab = 'notes' | 'templates' | 'export' | 'settings' | 'outline';
export type SidebarTab = 'projects' | 'outline' | 'search';
