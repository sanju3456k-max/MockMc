import React from 'react';
import type { MathTest } from '../../../../types';
import type { User } from 'firebase/auth';
import type { UserNoteItem } from '../../../DriveFileManager';
import { DriveFileManager } from '../../../DriveFileManager';

interface RepositoryFilesViewProps {
  notes: UserNoteItem[];
  tests: MathTest[];
  currentUser?: User | null;
  onAddNote: () => void;
  onDeleteNote: (id: string) => void;
  onRenameNote: (id: string, newName: string) => void;
  onEditNote?: (updatedNote: UserNoteItem) => void;
  onPreviewFile: (file: any) => void;
  onNoteDriveSynced?: (noteId: string, driveFileId: string, webViewLink: string) => void;
  onAddNewFileNote?: (newNote: UserNoteItem) => void;
  onImportDriveNotes?: (importedNotes: UserNoteItem[]) => void;
  onStartTest?: (test: MathTest) => void;
}

export const RepositoryFilesView: React.FC<RepositoryFilesViewProps> = ({
  notes,
  tests,
  currentUser,
  onAddNote,
  onDeleteNote,
  onRenameNote,
  onEditNote,
  onPreviewFile,
  onNoteDriveSynced,
  onAddNewFileNote,
  onImportDriveNotes,
}) => {
  return (
    <div className="w-full max-w-[1500px] mx-auto px-3 sm:px-6 py-4">
      <DriveFileManager
        notes={notes}
        testTitle="Study Materials Repository"
        testId="global_repo"
        allTests={tests.map((t) => ({ id: t.id, title: t.title, topic: t.topic }))}
        isGlobalPage={true}
        currentUser={currentUser}
        onAddNote={onAddNote}
        onDeleteNote={onDeleteNote}
        onRenameNote={onRenameNote}
        onEditNote={onEditNote}
        onPreviewFile={onPreviewFile}
        onNoteDriveSynced={onNoteDriveSynced}
        onAddNewFileNote={onAddNewFileNote}
        onImportDriveNotes={onImportDriveNotes}
      />
    </div>
  );
};
