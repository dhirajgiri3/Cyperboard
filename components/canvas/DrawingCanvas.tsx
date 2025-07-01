"use client";

import { Stage, Layer, Line, Circle } from 'react-konva';
import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Tool } from '../toolbar/MainToolbar';
import type { KonvaEventObject } from 'konva/lib/Node';
import { ILine } from '@/app/board/[id]/page';
import { StickyNoteElement } from '@/types';
import LiveCursors, { Cursor } from './LiveCursors';
import StickyNote from './StickyNote';
import Konva from 'konva';
import { 
  Grid, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  EyeOff,
  Settings,
  Move,
  Maximize2,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

function getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function smoothPoints(points: number[] | undefined, smoothness: number = 0.3): number[] {
  // Guard against undefined or null points
  if (!points || !Array.isArray(points) || points.length < 6) {
    return points || [];
  }
  
  const smoothed: number[] = [];
  smoothed.push(points[0], points[1]);
  
  for (let i = 2; i < points.length - 2; i += 2) {
    const prevX = points[i - 2];
    const prevY = points[i - 1];
    const currX = points[i];
    const currY = points[i + 1];
    const nextX = points[i + 2];
    const nextY = points[i + 3];
    
    // Additional safety checks for individual point values
    if (typeof prevX !== 'number' || typeof prevY !== 'number' || 
        typeof currX !== 'number' || typeof currY !== 'number' ||
        typeof nextX !== 'number' || typeof nextY !== 'number') {
      smoothed.push(currX || 0, currY || 0);
      continue;
    }
    
    const smoothX = currX + (nextX - prevX) * smoothness * 0.1;
    const smoothY = currY + (nextY - prevY) * smoothness * 0.1;
    
    smoothed.push(smoothX, smoothY);
  }
  
  smoothed.push(points[points.length - 2], points[points.length - 1]);
  return smoothed;
}

interface DrawingCanvasProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  tool: Tool;
  color: string;
  strokeWidth: number;
  initialLines: ILine[];
  initialStickyNotes?: StickyNoteElement[];
  selectedStickyNote?: string | null;
  onDrawEndAction: (lines: ILine[]) => void;
  onEraseAction?: (lineId: string) => void;
  onStickyNoteAddAction?: (stickyNote: StickyNoteElement) => void;
  onStickyNoteUpdateAction?: (stickyNote: StickyNoteElement) => void;
  onStickyNoteDeleteAction?: (stickyNoteId: string) => void;
  onStickyNoteSelectAction?: (stickyNoteId: string) => void;
  onCanvasClickAction?: (e: KonvaEventObject<MouseEvent>) => void;
  onStickyNoteDragStartAction?: () => void;
  onStickyNoteDragEndAction?: () => void;
  cursors: Record<string, Cursor>;
  moveCursorAction: (x: number, y: number) => void;
  onRealTimeDrawingAction?: (line: ILine) => void;
  onRealTimeLineUpdateAction?: (line: ILine) => void;
}

interface GridProps {
  width: number;
  height: number;
  scale: number;
  x: number;
  y: number;
}

function EnhancedGrid({ width, height, scale, x, y }: GridProps) {
  const lines = [];
  const gridSize = 20;
  const opacity = Math.min(Math.max(scale * 0.4, 0.05), 0.2);
  
  if (scale < 0.1) return null;
  
  const startX = Math.floor((-x / scale) / gridSize) * gridSize;
  const startY = Math.floor((-y / scale) / gridSize) * gridSize;
  const endX = startX + (width / scale) + gridSize * 2;
  const endY = startY + (height / scale) + gridSize * 2;
  
  const majorOpacity = Math.min(Math.max(scale * 0.6, 0.08), 0.3);
  
  for (let i = startX; i < endX; i += gridSize) {
    const isMajor = Math.abs(i) % (gridSize * 5) === 0;
    lines.push(
      <Line
        key={`v-${i}`}
        points={[i, startY, i, endY]}
        stroke={isMajor ? "#64748b" : "#e2e8f0"}
        strokeWidth={(isMajor ? 0.6 : 0.25) / scale}
        opacity={isMajor ? majorOpacity : opacity}
        perfectDrawEnabled={false}
        listening={false}
      />
    );
  }
  
  for (let i = startY; i < endY; i += gridSize) {
    const isMajor = Math.abs(i) % (gridSize * 5) === 0;
    lines.push(
      <Line
        key={`h-${i}`}
        points={[startX, i, endX, i]}
        stroke={isMajor ? "#64748b" : "#e2e8f0"}
        strokeWidth={(isMajor ? 0.6 : 0.25) / scale}
        opacity={isMajor ? majorOpacity : opacity}
        perfectDrawEnabled={false}
        listening={false}
      />
    );
  }
  
  return <>{lines}</>;
}

export default function DrawingCanvas({
  stageRef,
  tool,
  color,
  strokeWidth,
  initialLines,
  initialStickyNotes = [],
  selectedStickyNote,
  onDrawEndAction,
  onEraseAction,
  onStickyNoteUpdateAction,
  onStickyNoteDeleteAction,
  onStickyNoteSelectAction,
  onCanvasClickAction,
  onStickyNoteDragStartAction,
  onStickyNoteDragEndAction,
  cursors,
  moveCursorAction,
  onRealTimeDrawingAction,
  onRealTimeLineUpdateAction,
}: DrawingCanvasProps) {
  const [lines, setLines] = useState<ILine[]>(initialLines);
  const [stickyNotes, setStickyNotes] = useState<StickyNoteElement[]>(initialStickyNotes);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [dimensions, setDimensions] = useState({ 
    width: typeof window !== 'undefined' ? window.innerWidth : 1920, 
    height: typeof window !== 'undefined' ? window.innerHeight : 1080 
  });
  
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const performanceMode = useRef(false);
  const isSpacePressed = useRef(false);
  const isPanning = useRef(false);
  const isDragInProgress = useRef(false);
  const dragCooldownTimeout = useRef<NodeJS.Timeout | null>(null);
  
  // Cleanup drag cooldown timeout on unmount
  useEffect(() => {
    return () => {
      if (dragCooldownTimeout.current) {
        clearTimeout(dragCooldownTimeout.current);
      }
    };
  }, []);

  // Enhanced line rendering with improved visual quality
  const handleLineClick = useCallback(
    (lineIdx: number) => {
      if (tool === 'eraser' && onEraseAction) {
        // Use the line's id if available, else use index
        const line = lines[lineIdx];
        if (line && 'id' in line) {
          onEraseAction(line.id as string);
        }
      }
    },
    [tool, onEraseAction, lines]
  );

  const memoizedLines = useMemo(() => {
    return lines.map((line, i) => {
      // Ensure line exists and has valid points array
      if (!line || !line.points || !Array.isArray(line.points) || line.points.length === 0) {
        return null;
      }
      
      // Ensure points contains valid numbers
      const validPoints = line.points.filter((point) => 
        typeof point === 'number' && !isNaN(point) && isFinite(point)
      );
      
      if (validPoints.length < 2) {
        return null;
      }
      
      const points = performanceMode.current ? validPoints : smoothPoints(validPoints, 0.5);
      
      // Generate unique key by combining line id with array index to prevent duplicates
      // Use a stable identifier that doesn't change unless the line actually changes
      const uniqueKey = line.id ? `line-${line.id}-idx-${i}` : `line-noId-${i}`;
      
      return (
        <Line
          key={uniqueKey}
          points={points}
          stroke={line.color || '#000000'}
          strokeWidth={line.strokeWidth || 2}
          tension={0.4}
          lineCap="round"
          lineJoin="round"
          shadowColor={line.tool === 'pen' ? line.color : undefined}
          shadowBlur={line.tool === 'pen' ? 1 : 0}
          shadowOpacity={0.1}
          globalCompositeOperation={
            line.tool === 'eraser' ? 'destination-out' : 'source-over'
          }
          perfectDrawEnabled={false}
          listening={tool === 'eraser'}
          onClick={tool === 'eraser' ? () => handleLineClick(i) : undefined}
        />
      );
    }).filter(Boolean); // Remove null entries
  }, [lines, tool, handleLineClick]);

  useEffect(() => {
    setLines(initialLines);
  }, [initialLines]);

  useEffect(() => {
    setStickyNotes(initialStickyNotes);
  }, [initialStickyNotes]);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        isSpacePressed.current = true;
      }
      
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '0':
            e.preventDefault();
            resetZoom();
            break;
          case 'g':
            e.preventDefault();
            setShowGrid(!showGrid);
            break;
          case '=':
          case '+':
            e.preventDefault();
            zoomIn();
            break;
          case '-':
            e.preventDefault();
            zoomOut();
            break;
          case 'h':
            e.preventDefault();
            setShowControls(!showControls);
            break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressed.current = false;
        isPanning.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [showGrid, showControls]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetZoom = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    
    const newScale = 1;
    const newPos = { x: 0, y: 0 };
    
    stage.to({
      scaleX: newScale,
      scaleY: newScale,
      x: newPos.x,
      y: newPos.y,
      duration: 0.4,
      easing: Konva.Easings.EaseInOut,
    });
    
    setStageScale(newScale);
    setStagePos(newPos);
  }, [stageRef]);

  const zoomIn = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    
    const oldScale = stage.scaleX();
    const newScale = Math.min(8, oldScale * 1.3);
    
    const center = {
      x: dimensions.width / 2,
      y: dimensions.height / 2,
    };

    const mousePointTo = {
      x: (center.x - stage.x()) / oldScale,
      y: (center.y - stage.y()) / oldScale,
    };

    const newPos = {
      x: center.x - mousePointTo.x * newScale,
      y: center.y - mousePointTo.y * newScale,
    };

    stage.to({
      scaleX: newScale,
      scaleY: newScale,
      x: newPos.x,
      y: newPos.y,
      duration: 0.3,
      easing: Konva.Easings.EaseOut,
    });
    
    setStageScale(newScale);
    setStagePos(newPos);
  }, [stageRef, dimensions]);

  const zoomOut = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    
    const oldScale = stage.scaleX();
    const newScale = Math.max(0.05, oldScale / 1.3);
    
    const center = {
      x: dimensions.width / 2,
      y: dimensions.height / 2,
    };

    const mousePointTo = {
      x: (center.x - stage.x()) / oldScale,
      y: (center.y - stage.y()) / oldScale,
    };

    const newPos = {
      x: center.x - mousePointTo.x * newScale,
      y: center.y - mousePointTo.y * newScale,
    };

    stage.to({
      scaleX: newScale,
      scaleY: newScale,
      x: newPos.x,
      y: newPos.y,
      duration: 0.3,
      easing: Konva.Easings.EaseOut,
    });
    
    setStageScale(newScale);
    setStagePos(newPos);
  }, [stageRef, dimensions]);

  const fitToScreen = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || lines.length === 0) return;
    
    // Calculate bounding box of all lines
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    lines.forEach(line => {
      for (let i = 0; i < line.points.length; i += 2) {
        const x = line.points[i];
        const y = line.points[i + 1];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    });
    
    if (minX === Infinity) return;
    
    const padding = 50;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    const scaleX = (dimensions.width - padding * 2) / contentWidth;
    const scaleY = (dimensions.height - padding * 2) / contentHeight;
    const newScale = Math.min(scaleX, scaleY, 2);
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    const newPos = {
      x: dimensions.width / 2 - centerX * newScale,
      y: dimensions.height / 2 - centerY * newScale,
    };
    
    stage.to({
      scaleX: newScale,
      scaleY: newScale,
      x: newPos.x,
      y: newPos.y,
      duration: 0.5,
      easing: Konva.Easings.EaseInOut,
    });
    
    setStageScale(newScale);
    setStagePos(newPos);
  }, [stageRef, lines, dimensions]);

  const handleMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (isSpacePressed.current || tool === 'select') {
      isPanning.current = true;
      return;
    }
    
    // Check if clicking on background (Stage/Layer) vs other elements
    const targetName = e.target.getClassName();
    const isBackgroundClick = targetName === 'Stage' || targetName === 'Layer';
    
    // For sticky note tool: only trigger canvas click on background, not on existing sticky notes
    // Also prevent clicks immediately after drag operations to avoid unwanted note creation
    if (tool === 'sticky-note') {
      if (isBackgroundClick && !isDragInProgress.current && onCanvasClickAction) {
        onCanvasClickAction(e);
      }
      // Always return early for sticky note tool to prevent drawing
      return;
    }
    
    // Don't start drawing if clicking on sticky notes or other non-background elements
    if (!isBackgroundClick && tool !== 'eraser') {
      return;
    }
    
    setIsDrawing(true);
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    
    const stage = stageRef.current;
    if (!stage) return;
    
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    const stagePos = transform.point(pos);
    
    const newLine: ILine = { 
      id: `line-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      points: [stagePos.x, stagePos.y], 
      tool, 
      color, 
      strokeWidth: tool === 'eraser' ? strokeWidth * 2.5 : strokeWidth 
    };
    
    setLines(prev => [...prev, newLine]);
    
    // Broadcast the start of drawing for real-time collaboration
    if (onRealTimeDrawingAction) {
      onRealTimeDrawingAction(newLine);
    }
  }, [tool, color, strokeWidth, stageRef, onRealTimeDrawingAction, onCanvasClickAction]);

  const handleMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    const point = stage?.getPointerPosition();
    if (!point) return;

    moveCursorAction(point.x, point.y);

    if (isPanning.current) {
      return;
    }

    if (!isDrawing) return;

    const transform = stage?.getAbsoluteTransform().copy();
    if (!transform) return;
    
    transform.invert();
    const stagePoint = transform.point(point);

    if (lastPointer.current) {
      const dist = getDistance(lastPointer.current, stagePoint);
      if (dist < 0.5) return;
    }
    
    lastPointer.current = stagePoint;

    setLines(prev => {
      const newLines = [...prev];
      const lastLine = newLines[newLines.length - 1];
      if (lastLine) {
        const updatedLine = {
          ...lastLine,
          points: [...lastLine.points, stagePoint.x, stagePoint.y]
        };
        newLines[newLines.length - 1] = updatedLine;
        
        // Broadcast real-time drawing update for live collaboration
        if (onRealTimeLineUpdateAction) {
          onRealTimeLineUpdateAction(updatedLine);
        }
      }
      return newLines;
    });
  }, [isDrawing, moveCursorAction, onRealTimeLineUpdateAction]);

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
    lastPointer.current = null;
    isPanning.current = false;
    onDrawEndAction(lines);
  }, [lines, onDrawEndAction]);

  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const scaleBy = 1.15;
    const newScale = e.evt.deltaY > 0 
      ? Math.max(0.05, oldScale / scaleBy)
      : Math.min(8, oldScale * scaleBy);

    stage.scale({ x: newScale, y: newScale });

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
    
    setStageScale(newScale);
    setStagePos(newPos);
    
    performanceMode.current = newScale < 0.2;
  }, []);

  const getCursor = () => {
    if (isSpacePressed.current) return 'grab';
    if (isPanning.current) return 'grabbing';
    
    switch (tool) {
      case 'select': return 'default';
      case 'pen': return 'crosshair';
      case 'eraser': return 'cell';
      default: return 'crosshair';
    }
  };

  const getZoomLevel = () => {
    if (stageScale >= 2) return 'text-emerald-600';
    if (stageScale >= 1) return 'text-blue-600';
    if (stageScale >= 0.5) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-slate-50 to-gray-100 overflow-hidden">
      {/* Enhanced Controls Panel - Repositioned to avoid floating toolbar */}
      {showControls && (
        <div className="absolute top-6 right-6 z-30 flex flex-col gap-3 max-w-xs">
          {/* Main Control Panel with improved design */}
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-white/30 overflow-hidden">
            <div className="p-4 border-b border-gray-100/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`text-sm font-semibold ${getZoomLevel()}`}>
                    {Math.round(stageScale * 100)}%
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                  <div className="text-xs text-gray-500 font-medium">Canvas</div>
                </div>
                <button
                  onClick={() => setControlsCollapsed(!controlsCollapsed)}
                  className="p-1.5 rounded-lg hover:bg-gray-100/80 transition-all duration-200 text-gray-500 hover:scale-110"
                  title={controlsCollapsed ? "Expand controls" : "Collapse controls"}
                >
                  {controlsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
              </div>
            </div>
            
            {!controlsCollapsed && (
              <div className="p-4 space-y-4">
                {/* Zoom Controls */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Zoom</div>
                  <div className="flex gap-1">
                    <button
                      onClick={zoomIn}
                      className="flex-1 p-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 active:bg-blue-200 transition-all duration-200 text-blue-600 hover:text-blue-700 group"
                      title="Zoom In (Ctrl + +)"
                    >
                      <ZoomIn size={16} className="mx-auto group-hover:scale-110 transition-transform" />
                    </button>
                    <button
                      onClick={zoomOut}
                      className="flex-1 p-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 active:bg-blue-200 transition-all duration-200 text-blue-600 hover:text-blue-700 group"
                      title="Zoom Out (Ctrl + -)"
                    >
                      <ZoomOut size={16} className="mx-auto group-hover:scale-110 transition-transform" />
                    </button>
                    <button
                      onClick={resetZoom}
                      className="flex-1 p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-all duration-200 text-gray-600 hover:text-gray-700 group"
                      title="Reset Zoom (Ctrl + 0)"
                    >
                      <RotateCcw size={16} className="mx-auto group-hover:rotate-180 transition-transform duration-300" />
                    </button>
                  </div>
                </div>

                {/* View Controls */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">View</div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setShowGrid(!showGrid)}
                      className={`flex-1 p-2.5 rounded-xl transition-all duration-200 group ${
                        showGrid 
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm' 
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-700'
                      }`}
                      title="Toggle Grid (Ctrl + G)"
                    >
                      <Grid size={16} className="mx-auto group-hover:scale-110 transition-transform" />
                    </button>
                    <button
                      onClick={fitToScreen}
                      className="flex-1 p-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 active:bg-purple-200 transition-all duration-200 text-purple-600 hover:text-purple-700 group"
                      title="Fit to Screen"
                      disabled={lines.length === 0}
                    >
                      <Maximize2 size={16} className="mx-auto group-hover:scale-110 transition-transform" />
                    </button>
                    <button
                      onClick={() => setShowControls(false)}
                      className="flex-1 p-2.5 rounded-xl bg-red-50 hover:bg-red-100 active:bg-red-200 transition-all duration-200 text-red-600 hover:text-red-700 group"
                      title="Hide Controls (Ctrl + H)"
                    >
                      <EyeOff size={16} className="mx-auto group-hover:scale-110 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Show Controls Button */}
      {!showControls && (
        <button
          onClick={() => setShowControls(true)}
          className="absolute top-6 right-6 z-30 p-4 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 hover:bg-white hover:shadow-2xl transition-all duration-300 text-gray-700 hover:text-gray-900 group"
          title="Show Controls (Ctrl + H)"
        >
          <Settings size={20} className="group-hover:rotate-90 transition-transform duration-300" />
        </button>
      )}

      {/* Canvas Stage */}
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        draggable={tool === 'select' || isSpacePressed.current}
        style={{ cursor: getCursor() }}
      >
        {/* Grid Layer */}
        <Layer>
          {showGrid && (
            <EnhancedGrid 
              width={dimensions.width} 
              height={dimensions.height} 
              scale={stageScale}
              x={stagePos.x}
              y={stagePos.y}
            />
          )}
        </Layer>
        
        {/* Drawing Layer */}
        <Layer>
          {memoizedLines}
        </Layer>
        
        {/* Sticky Notes Layer */}
        <Layer>
          {stickyNotes.map((stickyNote, index) => (
            <StickyNote
              key={`sticky-${stickyNote.id}-idx-${index}`}
              id={stickyNote.id}
              x={stickyNote.x}
              y={stickyNote.y}
              width={stickyNote.width}
              height={stickyNote.height}
              text={stickyNote.text}
              color={stickyNote.color}
              fontSize={stickyNote.fontSize}
              isSelected={selectedStickyNote === stickyNote.id}
              onSelectAction={onStickyNoteSelectAction || (() => {})}
              onTextChangeAction={(id, text) => {
                if (onStickyNoteUpdateAction) {
                  onStickyNoteUpdateAction({
                    ...stickyNote,
                    text,
                    updatedAt: Date.now(),
                  });
                }
              }}
              onPositionChangeAction={(id, x, y) => {
                if (onStickyNoteUpdateAction) {
                  onStickyNoteUpdateAction({
                    ...stickyNote,
                    x,
                    y,
                    updatedAt: Date.now(),
                  });
                }
              }}
              onDeleteAction={onStickyNoteDeleteAction || (() => {})}
              isDraggable={tool === 'select' || tool === 'sticky-note'}
              onDragStartAction={() => {
                isDragInProgress.current = true;
                if (onStickyNoteDragStartAction) {
                  onStickyNoteDragStartAction();
                }
              }}
              onDragEndAction={() => {
                // Set a cooldown period after drag ends to prevent immediate canvas clicks
                if (dragCooldownTimeout.current) {
                  clearTimeout(dragCooldownTimeout.current);
                }
                dragCooldownTimeout.current = setTimeout(() => {
                  isDragInProgress.current = false;
                }, 150); // 150ms cooldown to prevent accidental clicks after drag
                
                if (onStickyNoteDragEndAction) {
                  onStickyNoteDragEndAction();
                }
              }}
            />
          ))}
        </Layer>
        
        {/* Live Cursors Layer */}
        <Layer>
          <LiveCursors cursors={cursors} />
        </Layer>
        
        {/* Tool Preview Layer */}
        <Layer>
          {tool === 'eraser' && lastPointer.current && (
            <Circle
              x={lastPointer.current.x}
              y={lastPointer.current.y}
              radius={strokeWidth * 1.2}
              stroke="#ef4444"
              strokeWidth={2}
              dash={[4, 4]}
              opacity={0.8}
            />
          )}
        </Layer>
      </Stage>

      {/* Enhanced Status Bar */}
      <div className="absolute bottom-6 left-6 right-6 z-30 flex items-center justify-between">
        {/* Left side - Performance and Pan Mode */}
        <div className="flex items-center gap-3">
          {performanceMode.current && (
            <div className="bg-amber-50/90 backdrop-blur-sm text-amber-700 border border-amber-200/60 rounded-full px-4 py-2 text-xs font-medium shadow-sm">
              ⚡ Performance Mode
            </div>
          )}
          
          {isSpacePressed.current && (
            <div className="bg-blue-50/90 backdrop-blur-sm text-blue-700 border border-blue-200/60 rounded-full px-4 py-2 text-xs font-medium shadow-sm flex items-center gap-2">
              <Move size={12} />
              Pan Mode
            </div>
          )}
        </div>
      </div>
    </div>
  );
}