import React from 'react';

interface HtmlNotesSplitDividerProps {
  isResizing: boolean;
  onStartResize: (e: React.MouseEvent | React.TouchEvent) => void;
}

export const HtmlNotesSplitDivider: React.FC<HtmlNotesSplitDividerProps> = ({
  isResizing,
  onStartResize
}) => {
  return (
    <div
      onMouseDown={onStartResize}
      onTouchStart={onStartResize}
      className={`split-divider ${isResizing ? 'active' : ''}`}
      title="Drag to resize Editor and Preview panes"
      style={{
        width: '8px',
        flex: '0 0 8px',
        minWidth: '8px',
        maxWidth: '8px',
        zIndex: 30
      }}
    >
      <div className="split-divider-handle" />
    </div>
  );
};
