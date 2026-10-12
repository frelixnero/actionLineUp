import React, { useState, useRef, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  Sliders,
  Sparkles,
  Move,
  Eye,
  RefreshCw
} from 'lucide-react';

interface ScorecardImageViewerProps {
  imageUrl: string;
  imageTitle?: string;
  onReloadProxy?: () => void;
  isLoading?: boolean;
}

type FilterPreset = 'normal' | 'high-contrast' | 'brightness' | 'grayscale' | 'invert';

export const ScorecardImageViewer: React.FC<ScorecardImageViewerProps> = ({
  imageUrl,
  imageTitle = 'Scorecard Photo',
  onReloadProxy,
  isLoading = false
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [filter, setFilter] = useState<FilterPreset>('normal');
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setFilter('normal');
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const getFilterStyle = (): string => {
    switch (filter) {
      case 'high-contrast':
        return 'contrast(180%) brightness(105%) saturate(120%)';
      case 'brightness':
        return 'brightness(140%) contrast(120%)';
      case 'grayscale':
        return 'grayscale(100%) contrast(160%)';
      case 'invert':
        return 'invert(90%) contrast(150%) hue-rotate(180deg)';
      case 'normal':
      default:
        return 'none';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/80 border-b border-slate-800 text-xs gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-slate-200 truncate max-w-[180px] sm:max-w-xs">
            {imageTitle}
          </span>
          <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-mono">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5">
          {/* Filter preset dropdown */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            <button
              onClick={() => setFilter('normal')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                filter === 'normal' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Normal photo view"
            >
              Normal
            </button>
            <button
              onClick={() => setFilter('high-contrast')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                filter === 'high-contrast' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Boost contrast to read faint pencil/pen"
            >
              High Contrast
            </button>
            <button
              onClick={() => setFilter('brightness')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                filter === 'brightness' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Brighten dark pool hall photo"
            >
              Brighten
            </button>
            <button
              onClick={() => setFilter('grayscale')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition hidden sm:block ${
                filter === 'grayscale' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Black & White scan style"
            >
              B&W
            </button>
          </div>

          <div className="h-4 w-px bg-slate-800 mx-0.5" />

          {/* Zoom & Rotate buttons */}
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRotate}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Rotate 90 degrees"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleReset}
            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition"
            title="Reset position & zoom"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Image Canvas Container */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`relative flex-1 overflow-hidden flex items-center justify-center bg-slate-950 select-none min-h-[380px] ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/80 z-20 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-xs text-slate-300 font-medium">Loading scorecard scan...</p>
          </div>
        )}

        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out'
          }}
          className="relative max-w-full max-h-full flex items-center justify-center p-4"
        >
          <img
            src={imageUrl}
            alt="Scorecard scan"
            style={{ filter: getFilterStyle() }}
            className="max-h-[70vh] w-auto object-contain rounded-lg shadow-2xl pointer-events-none transition-filter duration-200"
            draggable={false}
          />
        </div>

        {/* Hint banner at bottom */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none text-[11px] text-slate-500 bg-slate-950/70 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-slate-800/80">
          <span className="flex items-center gap-1">
            <Move className="w-3 h-3 text-slate-400" />
            Click and drag to pan around pencil marks
          </span>
          <span className="hidden sm:inline">Use High Contrast filter if handwriting is faint</span>
        </div>
      </div>
    </div>
  );
};
