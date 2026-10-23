import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface HtmlNotesZoomControlsProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

export const HtmlNotesZoomControls: React.FC<HtmlNotesZoomControlsProps> = ({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomReset
}) => {
  return (
    <div className="hidden sm:flex absolute bottom-4 right-4 z-30 items-center gap-1 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-2 py-1 rounded-full shadow-lg border border-slate-200 dark:border-zinc-700 text-xs text-slate-700 dark:text-zinc-200 select-none">
      <button
        type="button"
        onClick={onZoomOut}
        className="w-6 h-6 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center border-0 cursor-pointer transition-colors"
        title="Zoom Out"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onZoomReset}
        className="px-1.5 font-bold text-[11px] hover:text-blue-600 dark:hover:text-blue-400 border-0 bg-transparent cursor-pointer"
        title="Reset Zoom (Fit to Width)"
      >
        {zoomLevel}%
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        className="w-6 h-6 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center border-0 cursor-pointer transition-colors"
        title="Zoom In"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
