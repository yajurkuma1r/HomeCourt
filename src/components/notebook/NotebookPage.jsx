import React, { useRef, useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';

const CANVAS_WIDTH = 460;
const CANVAS_HEIGHT = 600;

const buildPath = (points) => {
  if (!Array.isArray(points) || points.length === 0) {
    return '';
  }
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
};

const NotebookPage = ({ pageIndex, data, mode, isLeft, penColor = '#d946ef', notebookType = 'main' }) => {
  const { activeHouse } = useAuth();
  const { socket } = useSocket();
  const boardRef = useRef(null);
  const drawingRef = useRef(false);
  const [draftStroke, setDraftStroke] = useState([]);
  const [optimisticStrokes, setOptimisticStrokes] = useState([]);
  const [text, setText] = useState(data?.text || '');
  
  useEffect(() => {
    setText(data?.text || '');
  }, [data?.text]);

  useEffect(() => {
    setOptimisticStrokes([]);
  }, [data?.strokes]);

  const getPointFromEvent = (event) => {
    const board = boardRef.current;
    if (!board) return null;

    const rect = board.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    return {
      x: Math.max(0, Math.min(CANVAS_WIDTH, x)),
      y: Math.max(0, Math.min(CANVAS_HEIGHT, y))
    };
  };

  const handlePointerDown = (event) => {
    if (mode === 'type') return;
    const point = getPointFromEvent(event);
    if (!point) return;

    drawingRef.current = true;
    setDraftStroke([point]);
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current || mode === 'type') return;
    const point = getPointFromEvent(event);
    if (!point) return;

    setDraftStroke((current) => [...current, point]);
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;

    const strokePoints = draftStroke;
    setDraftStroke([]);

    if (strokePoints.length < 2) return;

    const newStroke = {
      id: `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      color: penColor,
      width: mode === 'erase' ? 20 : 3,
      points: strokePoints,
      isEraser: mode === 'erase'
    };

    setOptimisticStrokes(prev => [...prev, newStroke]);
    const newStrokes = [...(data?.strokes || []), ...optimisticStrokes, newStroke];

    if (socket && activeHouse?.id) {
      const emitEvent = notebookType === 'study' ? 'study-notebook:update-page' : 'notebook:update-page';
      socket.emit(emitEvent, {
        houseId: activeHouse.id,
        pageIndex,
        strokes: newStrokes
      });
    }
  };

  const handleTextChange = (e) => {
    const newText = e.target.value;
    setText(newText);
    if (socket && activeHouse?.id) {
      const emitEvent = notebookType === 'study' ? 'study-notebook:update-page' : 'notebook:update-page';
      socket.emit(emitEvent, {
        houseId: activeHouse.id,
        pageIndex,
        text: newText
      });
    }
  };

  const strokes = [
    ...(data?.strokes || []),
    ...optimisticStrokes,
    ...(draftStroke.length > 1
      ? [{ id: 'draft', color: penColor, width: mode === 'erase' ? 20 : 3, points: draftStroke, isEraser: mode === 'erase' }]
      : [])
  ];

  const normalStrokes = strokes.filter(s => !s.isEraser);
  const eraserStrokes = strokes.filter(s => s.isEraser);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#fff',
        position: 'relative',
        borderRadius: isLeft ? '12px 0 0 12px' : '0 12px 12px 0',
        boxShadow: isLeft 
          ? 'inset -15px 0 20px -15px rgba(0,0,0,0.3), -5px 5px 15px rgba(0,0,0,0.4)' 
          : 'inset 15px 0 20px -15px rgba(0,0,0,0.3), 5px 5px 15px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        border: '1px solid rgba(0,0,0,0.1)'
      }}
    >
      {/* Paper texture and lines */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'repeating-linear-gradient(transparent, transparent 31px, #e2e8f0 31px, #e2e8f0 32px)',
        backgroundPosition: '0 40px',
        opacity: 0.7,
        pointerEvents: 'none'
      }} />

      {/* Vertical Margin Line */}
      <div style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: isLeft ? '40px' : '30px',
        width: '2px',
        background: 'rgba(239, 68, 68, 0.3)',
        pointerEvents: 'none'
      }} />

      <div
        ref={boardRef}
        style={{
          position: 'absolute',
          inset: 0,
          touchAction: 'none',
          cursor: mode === 'draw' ? 'crosshair' : mode === 'erase' ? 'cell' : 'text',
          zIndex: (mode === 'draw' || mode === 'erase') ? 10 : 5
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerLeave={finishStroke}
      >
        <svg viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}>
          <defs>
            <mask id={`eraserMask-${pageIndex}`}>
              <rect width="100%" height="100%" fill="white" />
              {eraserStrokes.map((stroke) => (
                <path
                  key={stroke.id}
                  d={buildPath(stroke.points)}
                  fill="none"
                  stroke="black"
                  strokeWidth={stroke.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </mask>
          </defs>
          <g mask={`url(#eraserMask-${pageIndex})`}>
            {normalStrokes.map((stroke) => (
              <path
                key={stroke.id}
                d={buildPath(stroke.points)}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        </svg>
      </div>

      <textarea
        value={text}
        onChange={handleTextChange}
        placeholder={mode === 'type' ? "Start typing..." : ""}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'transparent',
          border: 'none',
          resize: 'none',
          outline: 'none',
          padding: '44px 20px 20px 50px',
          fontFamily: "'Indie Flower', 'Comic Sans MS', cursive, sans-serif",
          fontSize: '22px',
          lineHeight: '32px',
          color: '#1e293b',
          zIndex: mode === 'type' ? 10 : 5,
          pointerEvents: mode === 'type' ? 'auto' : 'none',
          whiteSpace: 'pre-wrap',
          overflow: 'hidden'
        }}
      />
      
      {/* Page Number */}
      <div style={{
        position: 'absolute',
        bottom: '12px',
        [isLeft ? 'left' : 'right']: '16px',
        fontSize: '12px',
        color: '#94a3b8',
        fontFamily: 'sans-serif'
      }}>
        {pageIndex + 1}
      </div>
    </div>
  );
};

export default NotebookPage;
