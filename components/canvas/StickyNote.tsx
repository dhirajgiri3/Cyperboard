"use client";

import { useState, useRef, useEffect } from 'react';
import { Group, Rect, Text, Circle, Line, Arc, Star, RegularPolygon } from 'react-konva';
import { KonvaEventObject } from 'konva/lib/Node';
import Konva from 'konva';

export interface StickyNoteProps {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  fontSize: number;
  isSelected: boolean;
  onSelectAction: (id: string) => void;
  onTextChangeAction: (id: string, text: string) => void;
  onPositionChangeAction: (id: string, x: number, y: number) => void;
  onDeleteAction: (id: string) => void;
  onDragStartAction?: () => void;
  onDragEndAction?: () => void;
  isDraggable?: boolean;
}

export default function StickyNote({
  id,
  x,
  y,
  width,
  height,
  text,
  color,
  fontSize,
  isSelected,
  onSelectAction,
  onTextChangeAction,
  onPositionChangeAction,
  onDeleteAction,
  onDragStartAction,
  onDragEndAction,
  isDraggable = true,
}: StickyNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [animationPhase, setAnimationPhase] = useState(0);
  const groupRef = useRef<Konva.Group>(null);
  const animationRef = useRef<Konva.Animation | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const preventSingleClick = useRef(false);

  // Cleanup click timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setEditText(text);
  }, [text]);

  // Subtle breathing animation for better visual appeal
  useEffect(() => {
    if (isSelected && !isDragging) {
      const group = groupRef.current;
      if (!group) return;

      animationRef.current = new Konva.Animation((frame) => {
        if (frame) {
          const scale = 1 + Math.sin(frame.time * 0.002) * 0.02;
          group.scale({ x: scale, y: scale });
          setAnimationPhase(frame.time * 0.002);
        }
      }, group.getLayer());

      animationRef.current.start();
      
      return () => {
        if (animationRef.current) {
          animationRef.current.stop();
          animationRef.current = null;
        }
        group.scale({ x: 1, y: 1 });
      };
    }
  }, [isSelected, isDragging]);

  const handleClick = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true; // Prevent event bubbling to canvas
    e.evt.stopPropagation(); // Additional prevention of event propagation
    
    // Only handle click if not editing and not preventing due to double-click
    if (!isEditing && !preventSingleClick.current) {
      // Add a small delay to check if this is part of a double-click
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      
      clickTimeoutRef.current = setTimeout(() => {
        if (!preventSingleClick.current) {
          onSelectAction(id);
        }
        preventSingleClick.current = false;
      }, 250); // 250ms delay to distinguish from double-click
    }
  };

  const handleDoubleClick = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true; // Prevent event bubbling to canvas
    e.evt.stopPropagation(); // Additional prevention of event propagation
    
    // Prevent the single click from firing
    preventSingleClick.current = true;
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }
    
    // Only start editing if we're not already editing
    if (isEditing) return;
    
    setIsEditing(true);
    
    // Create an enhanced textarea for editing
    const stage = e.target.getStage();
    if (!stage) return;
    
    const stageBox = stage.container().getBoundingClientRect();
    const transform = stage.getAbsoluteTransform();
    
    // Calculate the exact position accounting for stage transformation
    const stagePoint = transform.point({ x, y });
    const areaPosition = {
      x: stageBox.left + stagePoint.x,
      y: stageBox.top + stagePoint.y,
    };

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    // Set initial value and style
    textarea.value = editText;
    textarea.style.position = 'absolute';
    textarea.style.top = areaPosition.y + 'px';
    textarea.style.left = areaPosition.x + 'px';
    textarea.style.width = (width * stage.scaleX()) + 'px';
    textarea.style.height = (height * stage.scaleY()) + 'px';
    textarea.style.fontSize = Math.max(12, fontSize * stage.scaleX()) + 'px';
    textarea.style.border = '3px solid ' + getBorderColor(color);
    textarea.style.borderRadius = '16px';
    textarea.style.padding = '16px';
    textarea.style.margin = '0px';
    textarea.style.overflow = 'hidden';
    textarea.style.background = `linear-gradient(135deg, ${color}, ${lightenColor(color)})`;
    textarea.style.outline = 'none';
    textarea.style.resize = 'none';
    textarea.style.lineHeight = '1.5';
    textarea.style.fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    textarea.style.fontWeight = '500';
    textarea.style.color = '#1f2937';
    textarea.style.zIndex = '10000';
    textarea.style.boxShadow = `
      0 25px 50px -12px rgba(0, 0, 0, 0.25),
      0 0 0 1px ${getBorderColor(color)}30,
      inset 0 1px 0 rgba(255, 255, 255, 0.3)
    `;
    textarea.style.backdropFilter = 'blur(8px)';
    textarea.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    textarea.style.transform = 'scale(1.02)';
    textarea.style.pointerEvents = 'auto';
    textarea.style.wordWrap = 'break-word';

    // Auto-resize functionality
    const autoResize = () => {
      textarea.style.height = 'auto';
      const newHeight = Math.max(textarea.scrollHeight, height * stage.scaleY());
      textarea.style.height = newHeight + 'px';
    };

    // Focus and select text
    setTimeout(() => {
      textarea.focus();
      if (text && text !== 'Double-click to add text...') {
        textarea.select();
      }
      autoResize();
    }, 50);

    const saveAndRemove = () => {
      const newText = textarea.value.trim();
      onTextChangeAction(id, newText);
      removeTextarea();
    };

    const removeTextarea = () => {
      if (textarea.parentNode) {
        textarea.style.transform = 'scale(0.95)';
        textarea.style.opacity = '0';
        setTimeout(() => {
          if (textarea.parentNode) {
            textarea.parentNode.removeChild(textarea);
          }
        }, 200);
      }
      setIsEditing(false);
    };

    // Prevent multiple textareas
    const existingTextarea = document.querySelector(`textarea[data-sticky-note-id="${id}"]`) as HTMLTextAreaElement;
    if (existingTextarea) {
      existingTextarea.focus();
      return;
    }
    
    textarea.setAttribute('data-sticky-note-id', id);

    // Event listeners
    textarea.addEventListener('input', autoResize);

    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation(); // Prevent stage key handlers
      
      if (e.key === 'Escape') {
        e.preventDefault();
        removeTextarea();
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveAndRemove();
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.setSelectionRange(start + 2, start + 2);
        autoResize();
      }
      // Delete sticky note when editing and Cmd/Ctrl+Backspace is pressed
      if ((e.key === 'Backspace' || e.key === 'Delete') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        removeTextarea();
        onDeleteAction(id);
      }
    });

    // Handle stage events that might interfere
    const handleStageEvents = (e: Event) => {
      e.stopPropagation();
    };

    stage.container().addEventListener('mousedown', handleStageEvents);
    stage.container().addEventListener('touchstart', handleStageEvents);

    // Cleanup function with event removal
    const cleanupTextarea = () => {
      stage.container().removeEventListener('mousedown', handleStageEvents);
      stage.container().removeEventListener('touchstart', handleStageEvents);
      removeTextarea();
    };

    // Override blur handler to include cleanup
    textarea.addEventListener('blur', () => {
      saveAndRemove();
      cleanupTextarea();
    });
  };

  const handleDragStart = () => {
    setIsDragging(true);
    if (animationRef.current) {
      animationRef.current.stop();
    }
    // Ensure the sticky note is selected when dragging starts
    if (!isSelected) {
      onSelectAction(id);
    }
    // Notify parent component about drag start
    if (onDragStartAction) {
      onDragStartAction();
    }
  };

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    setIsDragging(false);
    onPositionChangeAction(id, e.target.x(), e.target.y());
    // Notify parent component about drag end
    if (onDragEndAction) {
      onDragEndAction();
    }
  };

  // Enhanced color utilities
  const getBorderColor = (bgColor: string) => {
    const colors: Record<string, string> = {
      '#fef3c7': '#f59e0b', // Yellow
      '#dcfce7': '#10b981', // Green
      '#dbeafe': '#3b82f6', // Blue
      '#fce7f3': '#ec4899', // Pink
      '#f3e8ff': '#8b5cf6', // Purple
      '#fed7e2': '#f43f5e', // Rose
      '#fef0ff': '#d946ef', // Fuchsia
      '#ecfdf5': '#059669', // Emerald
      '#ffedd5': '#ea580c', // Orange
      '#f0f9ff': '#0ea5e9', // Sky
      '#fef7ed': '#f97316', // Amber
      '#f1f5f9': '#64748b', // Slate
    };
    return colors[bgColor] || '#6b7280';
  };

  // Get shadow color for enhanced depth
  const getShadowColor = (bgColor: string) => {
    const shadows: Record<string, string> = {
      '#fef3c7': 'rgba(245, 158, 11, 0.2)', // Yellow
      '#dcfce7': 'rgba(16, 185, 129, 0.2)', // Green
      '#dbeafe': 'rgba(59, 130, 246, 0.2)', // Blue
      '#fce7f3': 'rgba(236, 72, 153, 0.2)', // Pink
      '#f3e8ff': 'rgba(139, 92, 246, 0.2)', // Purple
      '#fed7e2': 'rgba(244, 63, 94, 0.2)', // Rose
      '#fef0ff': 'rgba(217, 70, 239, 0.2)', // Fuchsia
      '#ecfdf5': 'rgba(5, 150, 105, 0.2)', // Emerald
      '#ffedd5': 'rgba(234, 88, 12, 0.2)', // Orange
      '#f0f9ff': 'rgba(14, 165, 233, 0.2)', // Sky
      '#fef7ed': 'rgba(249, 115, 22, 0.2)', // Amber
      '#f1f5f9': 'rgba(100, 116, 139, 0.2)', // Slate
    };
    return shadows[bgColor] || 'rgba(0, 0, 0, 0.15)';
  };

  // Lighten color utility for gradients
  const lightenColor = (color: string) => {
    const colorMap: Record<string, string> = {
      '#fef3c7': '#fffbeb',
      '#dcfce7': '#f0fdf4',
      '#dbeafe': '#eff6ff',
      '#fce7f3': '#fdf2f8',
      '#f3e8ff': '#faf5ff',
      '#fed7e2': '#fdf2f8',
      '#fef0ff': '#fefcff',
      '#ecfdf5': '#f0fdf9',
      '#ffedd5': '#fff7ed',
      '#f0f9ff': '#f0f9ff',
      '#fef7ed': '#fffbeb',
      '#f1f5f9': '#f8fafc',
    };
    return colorMap[color] || color;
  };

  // Delete handling: Both keyboard (Cmd/Ctrl+Delete while editing) and board-level (Delete key when selected)
  // This provides multiple ways to delete while maintaining proper event handling separation

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  // Get dynamic corner radius based on note size
  const getCornerRadius = () => {
    const baseRadius = 16;
    const scaleFactor = Math.min(width, height) / 200;
    return Math.max(8, Math.min(baseRadius * scaleFactor, 24));
  };

  return (
    <Group
      ref={groupRef}
      x={x}
      y={y}
      draggable={isDraggable && !isEditing}
      onClick={handleClick}
      onTap={handleClick}  // For mobile/touch devices
      onDblClick={handleDoubleClick}
      onDblTap={handleDoubleClick}  // For mobile/touch devices
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      opacity={isDragging ? 0.8 : 1}
    >
      {/* Enhanced Multi-layer Shadow System */}
      <Rect
        x={8}
        y={12}
        width={width}
        height={height}
        fill="rgba(0, 0, 0, 0.04)"
        cornerRadius={getCornerRadius() + 2}
        blur={12}
      />
      <Rect
        x={4}
        y={8}
        width={width}
        height={height}
        fill="rgba(0, 0, 0, 0.06)"
        cornerRadius={getCornerRadius() + 1}
        blur={8}
      />
      <Rect
        x={2}
        y={4}
        width={width}
        height={height}
        fill={getShadowColor(color)}
        cornerRadius={getCornerRadius()}
        opacity={isDragging ? 0.4 : isHovered ? 0.9 : 0.7}
        blur={4}
      />
      
      {/* Main note background with enhanced styling */}
      <Rect
        width={width}
        height={height}
        fill={color}
        stroke={isSelected ? getBorderColor(color) : isHovered ? getBorderColor(color) : 'transparent'}
        strokeWidth={isSelected ? 3 : isHovered ? 2 : 0}
        cornerRadius={getCornerRadius()}
        shadowColor={getShadowColor(color)}
        shadowBlur={isSelected ? 12 : isHovered ? 8 : 6}
        shadowOffsetX={2}
        shadowOffsetY={4}
        opacity={isHovered ? 0.98 : 1}
      />

      {/* Editing indicator - subtle glow when in edit mode */}
      {isEditing && (
        <Rect
          width={width}
          height={height}
          fill="transparent"
          stroke="#3b82f6"
          strokeWidth={2}
          cornerRadius={getCornerRadius()}
          shadowColor="#3b82f6"
          shadowBlur={15}
          shadowOpacity={0.4}
          dash={[8, 4]}
          opacity={0.8}
        />
      )}

      {/* Gradient overlay for depth */}
      <Rect
        width={width}
        height={height / 3}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: 0, y: height / 3 }}
        fillLinearGradientColorStops={[0, 'rgba(255, 255, 255, 0.4)', 1, 'rgba(255, 255, 255, 0)']}
        cornerRadius={[getCornerRadius(), getCornerRadius(), 0, 0]}
        opacity={0.6}
      />

      {/* Modern top accent with gradient */}
      <Rect
        width={width}
        height={16}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: width, y: 0 }}
        fillLinearGradientColorStops={[
          0, getBorderColor(color),
          0.5, lightenColor(getBorderColor(color)),
          1, getBorderColor(color)
        ]}
        cornerRadius={[getCornerRadius(), getCornerRadius(), 0, 0]}
        opacity={0.6}
      />

      {/* Subtle texture lines with improved spacing */}
      {Array.from({ length: Math.floor((height - 50) / 24) }, (_, i) => (
        <Line
          key={`line-${i}`}
          points={[20, 50 + i * 24, width - 20, 50 + i * 24]}
          stroke="#e5e7eb"
          strokeWidth={0.5}
          opacity={0.25}
          dash={[2, 4]}
        />
      ))}

      {/* Enhanced text rendering with better typography */}
      {!isEditing && (
        <Text
          x={20}
          y={32}
          width={width - 40}
          height={height - 50}
          text={text || 'Double-click to add text...'}
          fontSize={fontSize}
          fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          fontWeight={text ? '500' : '400'}
          fill={text ? '#1f2937' : '#9ca3af'}
          fontStyle={text ? 'normal' : 'italic'}
          align="left"
          verticalAlign="top"
          wrap="word"
          ellipsis={true}
          lineHeight={1.6}
          letterSpacing={0.2}
        />
      )}

      {/* Empty state enhancement - show plus icon when hovering over empty notes */}
      {!text && isHovered && !isEditing && (
        <Circle
          x={width / 2}
          y={height / 2}
          radius={20}
          fill="rgba(255, 255, 255, 0.9)"
          stroke={getBorderColor(color)}
          strokeWidth={2}
          opacity={0.8}
          shadowColor={getBorderColor(color)}
          shadowBlur={6}
          shadowOpacity={0.3}
        />
      )}
      
      {!text && isHovered && !isEditing && (
        <>
          {/* Plus icon */}
          <Line
            points={[width / 2 - 8, height / 2, width / 2 + 8, height / 2]}
            stroke={getBorderColor(color)}
            strokeWidth={3}
            lineCap="round"
          />
          <Line
            points={[width / 2, height / 2 - 8, width / 2, height / 2 + 8]}
            stroke={getBorderColor(color)}
            strokeWidth={3}
            lineCap="round"
          />
        </>
      )}

      {/* Enhanced selection indicators with animations */}
      {isSelected && (
        <>
          {/* Primary selection border with pulse effect */}
          <Rect
            x={-4}
            y={-4}
            width={width + 8}
            height={height + 8}
            stroke={getBorderColor(color)}
            strokeWidth={3}
            cornerRadius={getCornerRadius() + 4}
            dash={[16, 8]}
            dashOffset={-animationPhase * 40}
            opacity={0.9}
            shadowColor={getBorderColor(color)}
            shadowBlur={8}
            shadowOpacity={0.4}
          />
          
          {/* Secondary glow ring */}
          <Rect
            x={-8}
            y={-8}
            width={width + 16}
            height={height + 16}
            stroke={getBorderColor(color)}
            strokeWidth={1}
            cornerRadius={getCornerRadius() + 8}
            opacity={0.3 + Math.sin(animationPhase) * 0.2}
            shadowColor={getBorderColor(color)}
            shadowBlur={12}
            shadowOpacity={0.3}
          />

          {/* Interactive corner handles */}
          <Circle
            x={width - 6}
            y={height - 6}
            radius={8 + Math.sin(animationPhase) * 2}
            fill={getBorderColor(color)}
            stroke="white"
            strokeWidth={3}
            opacity={0.95}
            shadowColor={getBorderColor(color)}
            shadowBlur={6}
            shadowOpacity={0.5}
          />
          
          {/* Top-right resize indicator */}
          <Star
            x={width - 6}
            y={6}
            numPoints={4}
            innerRadius={3}
            outerRadius={6}
            fill={getBorderColor(color)}
            rotation={45 + animationPhase * 15}
            opacity={0.85}
            shadowColor={getBorderColor(color)}
            shadowBlur={4}
            shadowOpacity={0.3}
          />
          
          {/* Bottom-left move indicator */}
          <RegularPolygon
            x={6}
            y={height - 6}
            sides={6}
            radius={5}
            fill={getBorderColor(color)}
            rotation={animationPhase * 25}
            opacity={0.8}
            shadowColor={getBorderColor(color)}
            shadowBlur={4}
            shadowOpacity={0.3}
          />
          
          {/* Top-left selection dot */}
          <Circle
            x={6}
            y={6}
            radius={4 + Math.cos(animationPhase) * 1}
            fill={getBorderColor(color)}
            opacity={0.9}
            shadowColor={getBorderColor(color)}
            shadowBlur={3}
            shadowOpacity={0.4}
          />

          {/* Selection label */}
          <Rect
            x={width - 60}
            y={-20}
            width={60}
            height={16}
            fill={getBorderColor(color)}
            cornerRadius={8}
            opacity={0.9}
            shadowColor={getBorderColor(color)}
            shadowBlur={4}
            shadowOpacity={0.3}
          />
          <Text
            x={width - 58}
            y={-18}
            width={56}
            height={12}
            text="SELECTED"
            fontSize={9}
            fontFamily="Inter, sans-serif"
            fontWeight="600"
            fill="white"
            align="center"
            verticalAlign="middle"
          />

          {/* Keyboard shortcut hints */}
          <Rect
            x={-80}
            y={height + 8}
            width={160}
            height={28}
            fill="rgba(0, 0, 0, 0.85)"
            cornerRadius={14}
            opacity={0.95}
            shadowColor="rgba(0, 0, 0, 0.3)"
            shadowBlur={8}
            shadowOpacity={0.5}
          />
          <Text
            x={-78}
            y={height + 12}
            width={156}
            height={20}
            text="⌫ Delete • ⌘Enter Edit • Drag Move"
            fontSize={10}
            fontFamily="Inter, sans-serif"
            fontWeight="500"
            fill="white"
            align="center"
            verticalAlign="middle"
          />
        </>
      )}

      {/* Enhanced hover effects */}
      {isHovered && !isSelected && (
        <>
          {/* Hover border with subtle animation */}
          <Rect
            x={-2}
            y={-2}
            width={width + 4}
            height={height + 4}
            stroke={getBorderColor(color)}
            strokeWidth={2}
            cornerRadius={getCornerRadius() + 2}
            opacity={0.6}
            dash={[12, 6]}
            dashOffset={Date.now() * 0.02 % 18}
          />
          
          {/* Hover glow effect */}
          <Rect
            x={-1}
            y={-1}
            width={width + 2}
            height={height + 2}
            stroke={getBorderColor(color)}
            strokeWidth={1}
            cornerRadius={getCornerRadius() + 1}
            opacity={0.4}
            shadowColor={getBorderColor(color)}
            shadowBlur={8}
            shadowOpacity={0.3}
          />

          {/* Hover corner indicators */}
          <Circle
            x={width - 4}
            y={4}
            radius={3}
            fill={getBorderColor(color)}
            opacity={0.7}
          />
          <Circle
            x={4}
            y={height - 4}
            radius={3}
            fill={getBorderColor(color)}
            opacity={0.7}
          />

          {/* Hover hint text */}
          <Rect
            x={width - 120}
            y={-16}
            width={120}
            height={14}
            fill="rgba(0, 0, 0, 0.8)"
            cornerRadius={7}
            opacity={0.9}
          />
          <Text
            x={width - 118}
            y={-14}
            width={116}
            height={10}
            text="Double-click to edit"
            fontSize={8}
            fontFamily="Inter, sans-serif"
            fontWeight="500"
            fill="white"
            align="center"
            verticalAlign="middle"
          />
        </>
      )}

      {/* Decorative elements for visual interest */}
      {isSelected && (
        <>
          {/* Corner decoration */}
          <Arc
            x={width - 16}
            y={16}
            innerRadius={8}
            outerRadius={10}
            angle={90}
            rotation={-90}
            fill={getBorderColor(color)}
            opacity={0.3}
          />
        </>
      )}
    </Group>
  );
}

export function getRandomStickyNoteColor(): string {
  const colors = [
    '#fef3c7', // Warm Yellow
    '#dcfce7', // Fresh Green
    '#dbeafe', // Ocean Blue
    '#fce7f3', // Soft Pink
    '#f3e8ff', // Lavender Purple
    '#fed7e2', // Rose
    '#ffedd5', // Sunset Orange
    '#f0f9ff', // Sky Blue
    '#ecfdf5', // Mint Green
    '#fef0ff', // Magenta
    '#fef7ed', // Warm Amber
    '#f1f5f9', // Cool Slate
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function getStickyNoteColorPalette(): string[] {
  return [
    '#fef3c7', // Warm Yellow
    '#dcfce7', // Fresh Green
    '#dbeafe', // Ocean Blue
    '#fce7f3', // Soft Pink
    '#f3e8ff', // Lavender Purple
    '#fed7e2', // Rose
    '#ffedd5', // Sunset Orange
    '#f0f9ff', // Sky Blue
    '#ecfdf5', // Mint Green
    '#fef0ff', // Magenta
    '#fef7ed', // Warm Amber
    '#f1f5f9', // Cool Slate
  ];
}
