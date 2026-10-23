import type { MathTest } from '../../types';
import type { User } from 'firebase/auth';
import type { UserNoteItem } from '../DriveFileManager';

export type NotesStudioMode = 'repository' | 'html';

export interface NotesStudioProps {
  tests: MathTest[];
  currentUser?: User | null;
  initialMode?: NotesStudioMode;
  onBack: () => void;
  onStartTest?: (test: MathTest) => void;
  isDarkMode?: boolean;
  toggleTheme?: () => void;
}

export interface NoteFilterState {
  searchQuery: string;
  tag: 'all' | 'formula' | 'trick' | 'mistake' | 'general' | 'table';
  testId: string; // 'all' or specific testId
}
