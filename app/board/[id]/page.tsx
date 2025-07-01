"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from "react";
import { gql, useMutation, useSubscription, useQuery } from "@apollo/client";
import { useSession } from "next-auth/react";
import MainToolbar, { Tool } from "@/components/toolbar/MainToolbar";
import FloatingDrawingToolbar from "@/components/toolbar/FloatingDrawingToolbar";
import FloatingStickyNoteToolbar from "@/components/toolbar/FloatingStickyNoteToolbar";
import CollaborationPanel from "@/components/layout/CollaborationPanel";
import { useParams } from "next/navigation";
import { Cursor } from "@/components/canvas/LiveCursors";
import Konva from "konva";
import { KonvaEventObject } from "konva/lib/Node";
import logger from "@/lib/logger";
import { PageLoading } from "@/components/ui/Loading";
import {
  X,
  AlertCircle,
} from "lucide-react";
import RenameBoardModal from "@/components/ui/modal/RenameBoardModal";
import InviteCollaboratorsModal from "@/components/ui/modal/InviteCollaboratorsModal";
import SuccessModal from "@/components/ui/modal/SuccessModal";
import { toast } from "sonner";
import CanvasHeader from "@/components/layout/CanvasHeader";
import { BoardProvider, useBoardContext } from "@/components/context/BoardContext";
import useRealTimeCollaboration from "@/hooks/useRealTimeCollaboration";
import { StickyNoteElement } from "@/types";
import { getRandomStickyNoteColor } from "@/components/canvas/StickyNote";
import StickyNoteColorPicker, { useStickyNoteColorPicker } from "@/components/ui/StickyNoteColorPicker";

const GET_BOARD = gql`
  query GetBoard($id: String!) {
    getBoard(id: $id) {
      id
      name
      createdAt
      updatedAt
      createdBy
      elements {
        id
        type
        data
      }
    }
  }
`;

const ADD_BOARD_ACTION = gql`
  mutation AddBoardAction($boardId: String!, $action: BoardActionInput!) {
    addBoardAction(boardId: $boardId, action: $action) {
      id
      elements { id type data }
      history { type data timestamp }
      historyIndex
    }
  }
`;

const UNDO_BOARD_ACTION = gql`
  mutation UndoBoardAction($boardId: String!) {
    undoBoardAction(boardId: $boardId) {
      id
      elements { id type data }
      history { type data timestamp }
      historyIndex
    }
  }
`;

const REDO_BOARD_ACTION = gql`
  mutation RedoBoardAction($boardId: String!) {
    redoBoardAction(boardId: $boardId) {
      id
      elements { id type data }
      history { type data timestamp }
      historyIndex
    }
  }
`;

const BOARD_UPDATES = gql`
  subscription BoardUpdates($boardId: String!) {
    boardUpdates(boardId: $boardId) {
      id
      name
      elements {
        id
        type
        data
      }
      history { type data timestamp }
      historyIndex
    }
  }
`;

const CURSOR_MOVEMENT = gql`
  subscription CursorMovement($boardId: String!) {
    cursorMovement(boardId: $boardId) {
      x
      y
      userId
    }
  }
`;

export interface ILine {
  id?: string;
  points: number[];
  tool: Tool;
  strokeWidth: number;
  color: string;
}

const DrawingCanvas = dynamic(
  () => import("@/components/canvas/DrawingCanvas"),
  { 
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <PageLoading
          title="Loading canvas"
          description="Preparing your collaborative drawing space..."
          variant="default"
        />
      </div>
    )
  }
);

export default function BoardPage() {
  return (
    <BoardProvider>
      <BoardPageContent />
    </BoardProvider>
  );
}

function BoardPageContent() {
  const { data: session, status } = useSession();
  const params = useParams();
  const boardId = params.id as string;
  const stageRef = useRef<Konva.Stage>(null);
  const { setBoardMetadata, updateBoardName, updateBoardTimestamp, fetchBoardMetadata } = useBoardContext();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollaborationOpen, setIsCollaborationOpen] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(100);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [renamedBoard, setRenamedBoard] = useState<{ id: string; name: string } | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  logger.info({ boardId }, "BoardPage loading");

  const {
    data: initialData,
    loading,
    error,
  } = useQuery(GET_BOARD, {
    variables: { id: boardId },
    skip: !boardId,
    onCompleted: (data) => {
      logger.info({ boardId: data.getBoard.id }, "Initial board data loaded");
      // Update board context with metadata
      if (data.getBoard) {
        setBoardMetadata({
          id: data.getBoard.id,
          name: data.getBoard.name,
          createdAt: data.getBoard.createdAt,
          updatedAt: data.getBoard.updatedAt,
          createdBy: data.getBoard.createdBy,
        });
      }
    },
    onError: (err) => {
      logger.error({ error: err }, "Error loading initial board data");
    },
  });

  // Check if current user is the board owner
  useEffect(() => {
    if (initialData?.getBoard && session?.user?.id) {
      setIsOwner(initialData.getBoard.createdBy === session.user.id);
    }
  }, [initialData?.getBoard, session?.user?.id]);

  // Setup real-time collaboration
  const {
    cursors: realTimeCursors,
    broadcastCursorMovement,
    broadcastDrawingStart,
    broadcastDrawingUpdate,
    broadcastDrawingComplete,
  } = useRealTimeCollaboration({
    boardId,
    userId: session?.user?.id,
    userName: session?.user?.name || 'Unknown User',
    isOwner,
    onBoardUpdate: (elements) => {
      // Handle real-time board element updates
      setLines(elements.map((el) => ({
        id: el.id,
        points: (el.data.points as number[]) || [],
        tool: (el.data.tool as Tool) || 'pen',
        strokeWidth: (el.data.strokeWidth as number) || 3,
        color: (el.data.color as string) || '#000000',
      })));
    },
    onCursorMove: (cursors) => {
      setCursors(cursors);
    },
    onElementAdded: (element) => {
      // Handle real-time element additions
      const newLine: ILine = {
        id: element.id,
        points: (element.data.points as number[]) || [],
        tool: (element.data.tool as Tool) || 'pen',
        strokeWidth: (element.data.strokeWidth as number) || 3,
        color: (element.data.color as string) || '#000000',
      };
      setLines(prev => [...prev, newLine]);
    },
    onElementUpdated: (element) => {
      // Handle real-time element updates
      const updatedLine: ILine = {
        id: element.id,
        points: (element.data.points as number[]) || [],
        tool: (element.data.tool as Tool) || 'pen',
        strokeWidth: (element.data.strokeWidth as number) || 3,
        color: (element.data.color as string) || '#000000',
      };
      setLines(prev => prev.map(line => 
        line.id === element.id ? updatedLine : line
      ));
    },
    onElementDeleted: (elementId) => {
      // Handle real-time element deletions
      setLines(prev => prev.filter(line => line.id !== elementId));
    },
  });

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#2563eb");
  const [strokeWidth, setStrokeWidth] = useState(3);

  const [lines, setLines] = useState<ILine[]>([]);
  const [stickyNotes, setStickyNotes] = useState<StickyNoteElement[]>([]);
  const [selectedStickyNote, setSelectedStickyNote] = useState<string | null>(null);
  const [history, setHistory] = useState<unknown[]>([]); // BoardAction[]
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isDragInProgress, setIsDragInProgress] = useState(false);
  
  // Sticky Note Color Picker State
  const colorPicker = useStickyNoteColorPicker();
  const [currentStickyNoteColor, setCurrentStickyNoteColor] = useState(getRandomStickyNoteColor());
  
  // Calculate canUndo and canRedo based on current state
  // Fixed logic to properly handle edge cases
  const canUndo = history.length > 0 && historyIndex >= 0;
  const canRedo = history.length > 0 && historyIndex < history.length - 1;
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const localUserId = useRef(
    "user-" + Math.random().toString(36).substr(2, 9)
  ).current;

  const [addBoardAction] = useMutation(ADD_BOARD_ACTION);
  const [undoBoardAction] = useMutation(UNDO_BOARD_ACTION);
  const [redoBoardAction] = useMutation(REDO_BOARD_ACTION);

  useSubscription(CURSOR_MOVEMENT, {
    variables: { boardId },
    skip: !boardId,
    onData: ({ data }) => {
      logger.debug({ subscriptionData: data }, "Cursor movement data received");
      const cursor = data.data?.cursorMovement;
      if (cursor && cursor.userId !== localUserId) {
        setCursors((prev) => ({
          ...prev,
          [cursor.userId]: { ...cursor, name: cursor.userId.substring(0, 5) },
        }));
      }
    },
  });

  useSubscription(BOARD_UPDATES, {
    variables: { boardId },
    skip: !boardId,
    onData: ({ data }) => {
      logger.debug({ subscriptionData: data }, "Board update data received");
      const updatedBoard = data.data?.boardUpdates;
      if (updatedBoard) {
        const allElements = updatedBoard.elements || [];
        
        // Filter drawing lines (non-sticky-note elements)
        const lineElements = allElements
          .filter((el: { data: string }) => {
            const parsed = typeof el.data === 'string' ? JSON.parse(el.data) : el.data;
            return parsed.type !== 'sticky-note';
          })
          .map((el: { data: string }) =>
            typeof el.data === 'string' ? JSON.parse(el.data) : el.data
          );
        
        // Filter sticky notes
        const stickyNoteElements = allElements
          .filter((el: { data: string }) => {
            const parsed = typeof el.data === 'string' ? JSON.parse(el.data) : el.data;
            return parsed.type === 'sticky-note';
          })
          .map((el: { data: string }) =>
            typeof el.data === 'string' ? JSON.parse(el.data) : el.data
          );
        
        setLines(lineElements);
        setStickyNotes(stickyNoteElements);
        
        // Only update history if it's provided (to preserve local state)
        if (updatedBoard.history !== undefined) {
          setHistory(updatedBoard.history || []);
        }
        if (updatedBoard.historyIndex !== undefined) {
          setHistoryIndex(updatedBoard.historyIndex ?? 0);
        }
      }
    },
  });

  useEffect(() => {
    logger.debug(
      { initialData },
      "Checking for initial data to populate canvas"
    );
    if (initialData?.getBoard) {
      const allElements = initialData.getBoard.elements || [];
      
      // Filter drawing lines (non-sticky-note elements)
      const lineElements = allElements
        .filter((el: { data: string }) => {
          const parsed = typeof el.data === 'string' ? JSON.parse(el.data) : el.data;
          return parsed.type !== 'sticky-note';
        })
        .map((el: { data: string }) =>
          typeof el.data === 'string' ? JSON.parse(el.data) : el.data
        );
      
      // Filter sticky notes
      const stickyNoteElements = allElements
        .filter((el: { data: string }) => {
          const parsed = typeof el.data === 'string' ? JSON.parse(el.data) : el.data;
          return parsed.type === 'sticky-note';
        })
        .map((el: { data: string }) =>
          typeof el.data === 'string' ? JSON.parse(el.data) : el.data
        );
      
      setLines(lineElements);
      setStickyNotes(stickyNoteElements);
      setHistory(initialData.getBoard.history || []);
      setHistoryIndex(initialData.getBoard.historyIndex ?? 0);
    }
  }, [initialData]);

  // Fetch additional board metadata from API
  useEffect(() => {
    if (boardId) {
      fetchBoardMetadata(boardId).catch((error) => {
        logger.error({ error, boardId }, "Failed to fetch board metadata from API");
      });
    }
  }, [boardId, fetchBoardMetadata]);

  const handleSetLines = async (newLines: ILine[]) => {
    const drawnLine = newLines[newLines.length - 1];
    if (drawnLine && boardId) {
      try {
        // Generate unique ID for the line if it doesn't have one
        const lineWithId = {
          ...drawnLine,
          id: drawnLine.id || `line-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
        
        // Broadcast drawing completion for real-time collaboration
        if (lineWithId.id && lineWithId.points && lineWithId.tool && lineWithId.color && typeof lineWithId.strokeWidth === 'number') {
          broadcastDrawingComplete({
            id: lineWithId.id,
            points: lineWithId.points,
            tool: lineWithId.tool,
            color: lineWithId.color,
            strokeWidth: lineWithId.strokeWidth,
          });
        }
        
        const { data } = await addBoardAction({
          variables: {
            boardId,
            action: {
              type: 'add',
              data: JSON.stringify(lineWithId),
            },
          },
        });
        if (data?.addBoardAction) {
          const allElements = data.addBoardAction.elements || [];
          
          // Filter drawing lines (non-sticky-note elements) for handleSetLines
          const lineElements = allElements
            .filter((el: { data: string }) => {
              const parsed = typeof el.data === 'string' ? JSON.parse(el.data) : el.data;
              return parsed.type !== 'sticky-note';
            })
            .map((el: { data: string }) =>
              typeof el.data === 'string' ? JSON.parse(el.data) : el.data
            );
          
          setLines(lineElements);
          setHistory(data.addBoardAction.history || []);
          setHistoryIndex(data.addBoardAction.historyIndex ?? 0);
          updateBoardTimestamp(boardId); // Update the updatedAt time in database
        }
      } catch (err) {
        logger.error({ err }, 'Failed to add board action');
      }
    }
  };

  const handleErase = async (lineId: string) => {
    if (lineId && boardId) {
      try {
        const { data } = await addBoardAction({
          variables: {
            boardId,
            action: {
              type: 'remove',
              data: JSON.stringify({ id: lineId }),
            },
          },
        });
        if (data?.addBoardAction) {
          const allElements = data.addBoardAction.elements || [];
          
          // Filter drawing lines (non-sticky-note elements) for handleErase
          const lineElements = allElements
            .filter((el: { data: string }) => {
              const parsed = typeof el.data === 'string' ? JSON.parse(el.data) : el.data;
              return parsed.type !== 'sticky-note';
            })
            .map((el: { data: string }) =>
              typeof el.data === 'string' ? JSON.parse(el.data) : el.data
            );
          
          setLines(lineElements);
          setHistory(data.addBoardAction.history || []);
          setHistoryIndex(data.addBoardAction.historyIndex ?? 0);
          updateBoardTimestamp(boardId); // Update the updatedAt time in database
        }
      } catch (err) {
        logger.error({ err }, 'Failed to erase board action');
      }
    }
  };

  // Sticky Notes Handlers
  const handleStickyNoteAdd = useCallback(async (stickyNote: StickyNoteElement) => {
    if (boardId) {
      try {
        const { data } = await addBoardAction({
          variables: {
            boardId,
            action: {
              type: 'add',
              data: JSON.stringify(stickyNote),
            },
          },
        });
        if (data?.addBoardAction) {
          // Update sticky notes from server response
          const allElements = data.addBoardAction.elements || [];
          const stickyNoteElements = allElements
            .filter((el: { type: string; data: string }) => 
              (typeof el.data === 'string' ? JSON.parse(el.data) : el.data).type === 'sticky-note'
            )
            .map((el: { data: string }) => 
              typeof el.data === 'string' ? JSON.parse(el.data) : el.data
            );
          setStickyNotes(stickyNoteElements);
          setHistory(data.addBoardAction.history || []);
          setHistoryIndex(data.addBoardAction.historyIndex ?? 0);
          updateBoardTimestamp(boardId);
        }
      } catch (err) {
        logger.error({ err }, 'Failed to add sticky note');
      }
    }
  }, [boardId, addBoardAction, updateBoardTimestamp]);

  const handleStickyNoteUpdate = useCallback(async (updatedStickyNote: StickyNoteElement) => {
    if (boardId) {
      try {
        const { data } = await addBoardAction({
          variables: {
            boardId,
            action: {
              type: 'update',
              data: JSON.stringify(updatedStickyNote),
            },
          },
        });
        if (data?.addBoardAction) {
          // Update sticky notes from server response
          const allElements = data.addBoardAction.elements || [];
          const stickyNoteElements = allElements
            .filter((el: { type: string; data: string }) => 
              (typeof el.data === 'string' ? JSON.parse(el.data) : el.data).type === 'sticky-note'
            )
            .map((el: { data: string }) => 
              typeof el.data === 'string' ? JSON.parse(el.data) : el.data
            );
          setStickyNotes(stickyNoteElements);
          updateBoardTimestamp(boardId);
        }
      } catch (err) {
        logger.error({ err }, 'Failed to update sticky note');
      }
    }
  }, [boardId, addBoardAction, updateBoardTimestamp]);

  const handleStickyNoteDelete = useCallback(async (stickyNoteId: string) => {
    if (!stickyNoteId || !boardId) {
      logger.warn({ stickyNoteId, boardId }, 'Invalid sticky note delete request');
      return;
    }
    
    logger.debug({ stickyNoteId, boardId }, 'Attempting to delete sticky note');
    
    try {
      const { data } = await addBoardAction({
        variables: {
          boardId,
          action: {
            type: 'remove',
            data: JSON.stringify({ id: stickyNoteId, type: 'sticky-note' }),
          },
        },
      });
      if (data?.addBoardAction) {
        // Update sticky notes from server response
        const allElements = data.addBoardAction.elements || [];
        const stickyNoteElements = allElements
          .filter((el: { type: string; data: string }) => 
            (typeof el.data === 'string' ? JSON.parse(el.data) : el.data).type === 'sticky-note'
          )
          .map((el: { data: string }) => 
            typeof el.data === 'string' ? JSON.parse(el.data) : el.data
          );
        setStickyNotes(stickyNoteElements);
        setHistory(data.addBoardAction.history || []);
        setHistoryIndex(data.addBoardAction.historyIndex ?? 0);
        updateBoardTimestamp(boardId);
        setSelectedStickyNote(null);
        logger.debug({ deletedId: stickyNoteId }, 'Sticky note deleted successfully');
      }
    } catch (err) {
      logger.error({ error: err, stickyNoteId }, 'Failed to delete sticky note');
    }
  }, [boardId, addBoardAction, updateBoardTimestamp]);

  const handleStickyNoteDragStart = useCallback(() => {
    setIsDragInProgress(true);
  }, []);

  const handleStickyNoteDragEnd = useCallback(() => {
    // Add a small delay to prevent immediate clicks after drag
    setTimeout(() => {
      setIsDragInProgress(false);
    }, 150);
  }, []);

  const handleStickyNoteSelect = useCallback((stickyNoteId: string) => {
    // When clicking on a sticky note, select it if not already selected
    // or deselect it if it's already selected (toggle behavior)
    setSelectedStickyNote(prev => {
      const newSelection = prev === stickyNoteId ? null : stickyNoteId;
      logger.debug({ prevSelection: prev, newSelection }, 'Sticky note selection changed');
      return newSelection;
    });
  }, []);

  const handleCanvasClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
    // Check if the click target is the Stage itself (background) or a sticky note
    const targetName = e.target.getClassName();
    const isBackgroundClick = targetName === 'Stage' || targetName === 'Layer';
    
    // Only proceed if it's a background click (not on sticky note or other elements)
    // Also prevent creating notes if drag is in progress
    if (!isBackgroundClick || isDragInProgress) {
      return;
    }
    
    // Add sticky note when sticky-note tool is selected and clicking on background
    if (tool === 'sticky-note' && boardId && session?.user?.id) {
      const stage = e.target.getStage();
      const pointerPosition = stage?.getPointerPosition();
      if (pointerPosition && stage) {
        const transform = stage.getAbsoluteTransform().copy();
        transform.invert();
        const stagePos = transform.point(pointerPosition);
        
        const newStickyNote: StickyNoteElement = {
          id: `sticky-note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'sticky-note',
          x: stagePos.x,
          y: stagePos.y,
          width: 220,
          height: 160,
          text: '',
          color: currentStickyNoteColor,
          fontSize: 14,
          createdBy: session.user.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        
        handleStickyNoteAdd(newStickyNote);
        // Auto-select the newly created sticky note for immediate editing
        setSelectedStickyNote(newStickyNote.id);
      }
    } else {
      // Deselect sticky note when clicking on background (not on sticky notes)
      setSelectedStickyNote(null);
    }
  }, [tool, boardId, session?.user?.id, handleStickyNoteAdd, currentStickyNoteColor, isDragInProgress]);

  const handleUndo = useCallback(async () => {
    logger.debug('Undo action triggered');
    if (boardId) {
      try {
        const { data } = await undoBoardAction({ variables: { boardId } });
        if (data?.undoBoardAction) {
          setLines(
            (data.undoBoardAction.elements || []).map((el: { data: string }) =>
              typeof el.data === 'string' ? JSON.parse(el.data) : el.data
            )
          );
          setHistory(data.undoBoardAction.history || []);
          setHistoryIndex(data.undoBoardAction.historyIndex ?? 0);
          updateBoardTimestamp(boardId); // Update the updatedAt time in database
        }
      } catch (err) {
        logger.error({ err }, 'Failed to undo board action');
        toast.error('Failed to undo.');
      }
    }
  }, [boardId, undoBoardAction, updateBoardTimestamp]);

  const handleRedo = useCallback(async () => {
    logger.debug('Redo action triggered');
    if (boardId) {
      try {
        const { data } = await redoBoardAction({ variables: { boardId } });
        if (data?.redoBoardAction) {
          setLines(
            (data.redoBoardAction.elements || []).map((el: { data: string }) =>
              typeof el.data === 'string' ? JSON.parse(el.data) : el.data
            )
          );
          setHistory(data.redoBoardAction.history || []);
          setHistoryIndex(data.redoBoardAction.historyIndex ?? 0);
          updateBoardTimestamp(boardId); // Update the updatedAt time in database
        }
      } catch (err) {
        logger.error({ err }, 'Failed to redo board action');
        toast.error('Failed to redo.');
      }
    }
  }, [boardId, redoBoardAction, updateBoardTimestamp]);

  const handleExport = useCallback(() => {
    logger.info("Export action triggered");
    if (stageRef.current) {
      const uri = stageRef.current.toDataURL({
        pixelRatio: 2,
        quality: 1,
      });
      const link = document.createElement("a");
      link.download = `cyperboard-${boardId}-${
        new Date().toISOString().split("T")[0]
      }.png`;
      link.href = uri;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [boardId]);

  const onlineUsers = Object.values(cursors).map((cursor) => ({
    id: cursor.userId,
    name: cursor.name || `User ${cursor.userId.substring(0, 5)}`,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cursor.userId}`,
    email: "",
    isOnline: true,
  }));

  // Create current user object based on session
  const currentUser = {
    id: localUserId,
    name: session?.user?.name || "You",
    avatar: session?.user?.image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${localUserId}`,
    email: session?.user?.email || "",
    isOnline: true,
  };

  // Remove current user from onlineUsers if they exist there
  const filteredOnlineUsers = onlineUsers.filter(u => u.id !== localUserId);

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Board link copied to clipboard!");
    } catch {
      toast("Board link copied to clipboard!");
    }
  }, []);

  const handleInviteCollaborators = useCallback(() => {
    setShowInviteModal(true);
  }, []);

  const handleRenameBoard = useCallback(() => {
    if (initialData?.getBoard) {
      setShowRenameModal(true);
    }
  }, [initialData?.getBoard]);

  const handleBoardRenamed = useCallback((board: { id: string; name: string }) => {
    setRenamedBoard(board);
    setShowSuccessModal(true);
    updateBoardName(board.name);
    toast.success('Board renamed!');
    // Optionally, refetch board data here
  }, [updateBoardName]);

  const [isPresentationMode, setIsPresentationMode] = useState(false);

  const handleTogglePresentation = useCallback(() => {
    setIsPresentationMode(prev => {
      const newMode = !prev;
      if (newMode) {
        // Enter presentation mode
        document.documentElement.requestFullscreen?.();
        setIsSidebarOpen(false);
        setIsCollaborationOpen(false);
        setShowKeyboardShortcuts(false);
        toast.success('Entered presentation mode');
      } else {
        // Exit presentation mode
        if (document.fullscreenElement) {
          document.exitFullscreen?.();
        }
        toast.success('Exited presentation mode');
      }
      return newMode;
    });
  }, []);

  // Canvas navigation functions
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
    });
    
    setCurrentZoom(100);
  }, []);

  const fitToScreen = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || lines.length === 0) {
      toast.info("No content to fit to screen");
      return;
    }
    
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
    
    const scaleX = (window.innerWidth - padding * 2) / contentWidth;
    const scaleY = (window.innerHeight - padding * 2) / contentHeight;
    const newScale = Math.min(scaleX, scaleY, 2);
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    const newPos = {
      x: window.innerWidth / 2 - centerX * newScale,
      y: window.innerHeight / 2 - centerY * newScale,
    };
    
    stage.to({
      scaleX: newScale,
      scaleY: newScale,
      x: newPos.x,
      y: newPos.y,
      duration: 0.5,
      easing: Konva.Easings.EaseInOut,
    });
    
    setCurrentZoom(Math.round(newScale * 100));
  }, [lines]);

  const zoomIn = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const newScale = Math.min(4, oldScale * 1.3);

    const center = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
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
    
    setCurrentZoom(Math.round(newScale * 100));
  }, []);

  const zoomOut = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const newScale = Math.max(0.1, oldScale / 1.3);

    const center = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
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
    
    setCurrentZoom(Math.round(newScale * 100));
  }, []);

  // Enhanced keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "z":
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
            break;
          case "y":
            e.preventDefault();
            handleRedo();
            break;
          case "s":
            e.preventDefault();
            handleExport();
            break;
          case "/":
            e.preventDefault();
            handleShare();
            break;
          case "0":
            e.preventDefault();
            resetZoom();
            break;
          case "g":
            e.preventDefault();
            setShowGrid(!showGrid);
            break;
          case "=":
          case "+":
            e.preventDefault();
            zoomIn();
            break;
          case "-":
            e.preventDefault();
            zoomOut();
            break;
        }
      }

      // Tool shortcuts
      switch (e.key) {
        case "v":
          if (e.metaKey) {
            e.preventDefault();
            setTool("select");
          }
          break;
        case "p":
          if (e.metaKey) {
            e.preventDefault();
            setTool("pen");
          }
          break;
        case "e":
          if (e.metaKey) {
            e.preventDefault();
            setTool("eraser");
          }
          break;
        case "s":
          if (e.metaKey && e.shiftKey) {
            e.preventDefault();
            setTool("sticky-note");
          }
          break;
        case "c":
          if (e.metaKey && e.shiftKey && tool === "sticky-note") {
            e.preventDefault();
            // Open color picker at center of screen
            colorPicker.openPicker(currentStickyNoteColor, {
              x: window.innerWidth / 2 - 150,
              y: window.innerHeight / 2 - 150
            });
          }
          break;
        case "r":
          if (e.metaKey) {
            e.preventDefault();
            handleRenameBoard();
          }
          break;
        case "Escape":
          setIsSidebarOpen(false);
          setIsCollaborationOpen(false);
          setShowKeyboardShortcuts(false);
          setShowRenameModal(false);
          setSelectedStickyNote(null); // Deselect sticky notes
          break;
        case "?":
          setShowKeyboardShortcuts(!showKeyboardShortcuts);
          break;
        case "Delete":
        case "Backspace":
          if (selectedStickyNote) {
            e.preventDefault();
            logger.debug({ selectedStickyNote }, 'Deleting sticky note via keyboard');
            handleStickyNoteDelete(selectedStickyNote);
            setSelectedStickyNote(null);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [
    handleUndo,
    handleRedo,
    handleExport,
    handleShare,
    handleRenameBoard,
    showKeyboardShortcuts,
    showGrid,
    resetZoom,
    zoomIn,
    zoomOut,
    selectedStickyNote,
    handleStickyNoteDelete,
    tool,
    currentStickyNoteColor,
    colorPicker,
  ]);

  const handleClearCanvas = async () => {
    const toastId = toast(
      "Are you sure you want to clear the entire canvas?",
      {
        duration: 8000,
        action: {
          label: "Clear",
          onClick: async () => {
            if (boardId) {
              try {
                const { data } = await addBoardAction({
                  variables: {
                    boardId,
                    action: {
                      type: 'clear',
                      data: JSON.stringify({}),
                    },
                  },
                });
                if (data?.addBoardAction) {
                  setLines([]);
                  setHistory(data.addBoardAction.history || []);
                  setHistoryIndex(data.addBoardAction.historyIndex ?? 0);
                  updateBoardTimestamp(boardId); // Update the updatedAt time in database
                  toast.success('Canvas cleared! You can undo this action.');
                }
              } catch (err) {
                logger.error({ err }, 'Failed to clear canvas');
                toast.error('Failed to clear canvas.');
              }
            }
            toast.dismiss(toastId);
          },
        },
        cancel: {
          label: "Cancel",
          onClick: () => toast.dismiss(toastId),
        },
      }
    );
  };

  if (loading) {
    return (
      <PageLoading
        title="Loading your board"
        description="Please wait while we prepare your canvas for collaboration"
        variant="default"
      />
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-red-50 border-2 border-red-200 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">
            Oops! Something went wrong
          </h2>
          <p className="text-slate-600 mb-6">{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show loading state while authentication is being determined
  if (status === 'loading') {
    return (
      <PageLoading
        title="Authenticating"
        description="Verifying your access to the board..."
        variant="default"
      />
    );
  }

  // Redirect to login if not authenticated
  if (status === 'unauthenticated') {
    window.location.href = '/login';
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex flex-col overflow-hidden">
      {/* Enhanced Header */}
      <CanvasHeader
        currentUser={currentUser}
        onlineUsers={filteredOnlineUsers}
        onShare={handleShare}
        onOpenCollaboration={() => setIsCollaborationOpen(true)}
        onInvite={handleInviteCollaborators}
        onRename={handleRenameBoard}
        onFitToScreen={fitToScreen}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        onTogglePresentation={handleTogglePresentation}
        isPresentationMode={isPresentationMode}
        zoomLevel={currentZoom}
      />

      {/* Main Content */}
      <div className="flex flex-1 pt-16">
        {/* Desktop Sidebar - Enhanced */}
        <aside className="hidden lg:flex flex-col w-20 bg-white/90 backdrop-blur-sm border-r border-slate-200/60 shadow-sm z-10 transition-all duration-300 hover:w-22">
          <div className="flex-1 flex flex-col items-center py-6 space-y-4">
            {/* Main Toolbar */}
            <MainToolbar
              tool={tool}
              setToolAction={setTool}
              undoAction={handleUndo}
              redoAction={handleRedo}
              canUndo={canUndo}
              canRedo={canRedo}
              onExportAction={handleExport}
              onClearCanvasAction={handleClearCanvas}
              vertical
            />
            {/* Separator when pen tool is active */}
            {tool === "pen" && (
              <div className="w-8 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
            )}
            {/* Pen Tools Badge - Mini version for sidebar */}
            {tool === "pen" && (
              <div className="flex flex-col items-center space-y-2 p-2 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200/60 shadow-sm">
                {/* Color indicator */}
                <div
                  className="w-8 h-8 rounded-lg border-2 border-white shadow-md ring-2 ring-indigo-200/60"
                  style={{ backgroundColor: color }}
                  title={`Color: ${color.toUpperCase()}`}
                />
                {/* Stroke width indicator */}
                <div className="flex flex-col items-center space-y-1">
                  <div
                    className="bg-slate-600 rounded-full"
                    style={{
                      width: Math.max(2, Math.min(strokeWidth * 0.8, 16)),
                      height: Math.max(2, Math.min(strokeWidth * 0.8, 16)),
                    }}
                  />
                  <span className="text-xs font-medium text-slate-600">
                    {strokeWidth}
                  </span>
                </div>
              </div>
            )}
          </div>
        </aside>
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
            <aside className="fixed left-0 top-16 bottom-0 w-80 bg-white/95 backdrop-blur-xl border-r border-slate-200/60 z-50 lg:hidden overflow-y-auto shadow-2xl">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">
                  Drawing Tools
                </h3>
                <MainToolbar
                  tool={tool}
                  setToolAction={setTool}
                  undoAction={handleUndo}
                  redoAction={handleRedo}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onExportAction={handleExport}
                  onClearCanvasAction={handleClearCanvas}
                  vertical={false}
                />
              </div>
            </aside>
          </>
        )}
        {/* Canvas Area */}
        <main className="flex-1 relative">
          {/* Collaboration Panel */}
          {isCollaborationOpen && (
            <>
              <div
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
                onClick={() => setIsCollaborationOpen(false)}
              />
              <div className="fixed right-0 top-16 bottom-0 w-80 bg-white/95 backdrop-blur-xl border-l border-slate-200/60 z-50 overflow-y-auto shadow-2xl">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-slate-800">
                      Collaboration
                    </h3>
                    <button
                      onClick={() => setIsCollaborationOpen(false)}
                      className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <CollaborationPanel
                    users={[currentUser, ...filteredOnlineUsers]}
                    currentUserId={localUserId}
                    onInviteAction={handleInviteCollaborators}
                    boardOwner={session?.user?.name || "Owner"}
                    lastActivity={new Date().toISOString()}
                  />
                </div>
              </div>
            </>
          )}
          {/* Canvas */}
          <div className="absolute inset-0 z-5">
            <DrawingCanvas
              stageRef={stageRef}
              tool={tool}
              color={color}
              strokeWidth={strokeWidth}
              initialLines={lines}
              initialStickyNotes={stickyNotes}
              selectedStickyNote={selectedStickyNote}
              onDrawEndAction={handleSetLines}
              onEraseAction={handleErase}
              onStickyNoteAddAction={handleStickyNoteAdd}
              onStickyNoteUpdateAction={handleStickyNoteUpdate}
              onStickyNoteDeleteAction={handleStickyNoteDelete}
              onStickyNoteSelectAction={handleStickyNoteSelect}
              onCanvasClickAction={handleCanvasClick}
              onStickyNoteDragStartAction={handleStickyNoteDragStart}
              onStickyNoteDragEndAction={handleStickyNoteDragEnd}
              cursors={realTimeCursors}
              moveCursorAction={broadcastCursorMovement}
              onRealTimeDrawingAction={(line: ILine) => {
                if (line.id && line.points && line.tool && line.color && typeof line.strokeWidth === 'number') {
                  broadcastDrawingStart({
                    id: line.id,
                    points: line.points,
                    tool: line.tool,
                    color: line.color,
                    strokeWidth: line.strokeWidth,
                  });
                }
              }}
              onRealTimeLineUpdateAction={(line: ILine) => {
                if (line.id && line.points && line.tool && line.color && typeof line.strokeWidth === 'number') {
                  broadcastDrawingUpdate({
                    id: line.id,
                    points: line.points,
                    tool: line.tool,
                    color: line.color,
                    strokeWidth: line.strokeWidth,
                  });
                }
              }}
            />
          </div>
          {/* Floating Drawing Toolbar - Positioned next to main toolbar */}
          <FloatingDrawingToolbar
            isActive={tool === "pen"}
            color={color}
            onColorChange={setColor}
            strokeWidth={strokeWidth}
            onStrokeWidthChange={setStrokeWidth}
            position="left"
            className="lg:left-24 lg:top-20 max-lg:hidden"
          />
          {/* Floating Sticky Note Toolbar - Positioned below drawing toolbar */}
          <FloatingStickyNoteToolbar
            currentColor={currentStickyNoteColor}
            onColorChangeAction={setCurrentStickyNoteColor}
            onColorPickerOpenAction={(position) => {
              colorPicker.openPicker(currentStickyNoteColor, position);
            }}
            isVisible={tool === "sticky-note"}
          />
        </main>
      </div>
      {/* Enhanced Mobile Bottom Toolbar */}
      <div className="fixed bottom-0 left-0 right-0 lg:hidden z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200/60 shadow-2xl">
        <div className="px-4 py-3 pb-safe">
          <MainToolbar
            tool={tool}
            setToolAction={setTool}
            undoAction={handleUndo}
            redoAction={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            onExportAction={handleExport}
            onClearCanvasAction={handleClearCanvas}
            vertical={false}
          />
        </div>
      </div>
      {/* Enhanced Keyboard Shortcuts Help */}
      {showKeyboardShortcuts && (
        <div
          className="fixed z-45 bg-gradient-to-br from-slate-900/95 to-slate-800/95 text-white rounded-2xl px-5 py-4 text-xs opacity-90 hover:opacity-100 transition-all duration-300 backdrop-blur-xl border border-slate-700/50 shadow-2xl
                       bottom-4 left-4 lg:bottom-4 lg:left-4 
                       max-lg:bottom-32 max-lg:left-4 max-lg:max-w-xs
                       max-sm:bottom-36 max-sm:left-2 max-sm:right-2 max-sm:mx-auto max-sm:w-auto max-sm:text-center"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⌨️</span>
              <div className="font-semibold text-amber-300">
                Keyboard Shortcuts
              </div>
            </div>
            <button
              onClick={() => setShowKeyboardShortcuts(false)}
              className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-700/50"
              title="Hide shortcuts (Press ? to toggle)"
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-3">
            {/* Tools Section */}
            <div>
              <div className="text-cyan-300 font-medium mb-2 text-xs">
                {" "}
                Tools
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <kbd className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    ⌘V
                  </kbd>
                  <span className="text-slate-300">Select</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    ⌘P
                  </kbd>
                  <span className="text-slate-300">Pen</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    ⌘⇧S
                  </kbd>
                  <span className="text-slate-300">Sticky Note</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    ⌘⇧C
                  </kbd>
                  <span className="text-slate-300">Color Picker</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    ⌘E
                  </kbd>
                  <span className="text-slate-300">Eraser</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    ⌘R
                  </kbd>
                  <span className="text-slate-300">Rename</span>
                </div>
              </div>
            </div>

            {/* Actions Section */}
            <div>
              <div className="text-green-300 font-medium mb-2 text-xs">
                Actions
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <kbd className="bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    ⌘Z
                  </kbd>
                  <span className="text-slate-300">Undo</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    ⌘Y
                  </kbd>
                  <span className="text-slate-300">Redo</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    ⌘S
                  </kbd>
                  <span className="text-slate-300">Export</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    ⌘/
                  </kbd>
                  <span className="text-slate-300">Share</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    Del
                  </kbd>
                  <span className="text-slate-300">Delete selected</span>
                </div>
              </div>
            </div>

            {/* Navigation Section */}
            <div>
              <div className="text-orange-300 font-medium mb-2 text-xs">
                Navigation
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <kbd className="bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    Space
                  </kbd>
                  <span className="text-slate-300">Pan canvas</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    Scroll
                  </kbd>
                  <span className="text-slate-300">Zoom</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    ⌘0
                  </kbd>
                  <span className="text-slate-300">Reset view</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded font-mono text-xs">
                    ⌘G
                  </kbd>
                  <span className="text-slate-300">Toggle grid</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Help Toggle Button */}
      {!showKeyboardShortcuts && (
        <button
          onClick={() => setShowKeyboardShortcuts(true)}
          className="fixed z-45 bg-slate-900/80 hover:bg-slate-800/90 text-white rounded-full p-3 backdrop-blur-xl border border-slate-700/50 shadow-xl transition-all duration-300 hover:scale-110
                     bottom-4 left-4 lg:bottom-4 lg:left-4 
                     max-lg:bottom-32 max-lg:left-4 
                     max-sm:bottom-36 max-sm:left-4"
          title="Show keyboard shortcuts (?)"
        >
          <span className="text-lg">⌨️</span>
        </button>
      )}
      {/* Rename Board Modal */}
      <RenameBoardModal
        isOpen={showRenameModal}
        onCloseAction={() => setShowRenameModal(false)}
        onSuccessAction={handleBoardRenamed}
        board={initialData?.getBoard ? { id: initialData.getBoard.id, name: initialData.getBoard.name } : null}
      />

      {/* Invite Collaborators Modal */}
      <InviteCollaboratorsModal
        isOpen={showInviteModal}
        onCloseAction={() => setShowInviteModal(false)}
        boardId={boardId}
        boardName={initialData?.getBoard?.name || "Untitled Board"}
      />

      {/* Success Modal */}
      <SuccessModal
        isOpen={showSuccessModal}
        onCloseAction={() => setShowSuccessModal(false)}
        title="Board Renamed Successfully!"
        message="Your board has been renamed and is ready for continued collaboration."
        boardId={renamedBoard?.id}
        boardName={renamedBoard?.name}
      />

      {/* Sticky Note Color Picker */}
      {colorPicker.isOpen && (
        <StickyNoteColorPicker
          selectedColor={colorPicker.selectedColor}
          onColorSelectAction={(color: string) => {
            setCurrentStickyNoteColor(color);
            colorPicker.setSelectedColor(color);
          }}
          onCloseAction={colorPicker.closePicker}
          position={colorPicker.position}
        />
      )}
    </div>
  );
}
