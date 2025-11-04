import { useEffect, useRef, useState } from 'react';
import { Canvas, Circle, Rect, Line, PencilBrush } from 'fabric';
import './CollaborationCanvas.css';

/**
 * Collaboration Canvas Component
 * Drawing canvas using Fabric.js v6
 */
export function CollaborationCanvas({ 
  canvasState, 
  onCanvasUpdate, 
  studentCanDraw = true,
  isStudent = false,
  disabled = false 
}) {
  const canvasRef = useRef(null);
  const fabricCanvasRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const updateTimeoutRef = useRef(null);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new Canvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#ffffff'
    });

    fabricCanvasRef.current = canvas;

    // Set up free drawing brush
    const pencilBrush = new PencilBrush(canvas);
    pencilBrush.width = 3;
    pencilBrush.color = '#000000';
    canvas.freeDrawingBrush = pencilBrush;

    // Handle canvas changes (debounced)
    const handleCanvasChange = () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      updateTimeoutRef.current = setTimeout(() => {
        if (canvas && onCanvasUpdate) {
          const json = canvas.toJSON();
          onCanvasUpdate(json);
        }
      }, 1500); // 1.5 second debounce
    };

    canvas.on('path:created', handleCanvasChange);
    canvas.on('object:added', handleCanvasChange);
    canvas.on('object:modified', handleCanvasChange);
    canvas.on('object:removed', handleCanvasChange);

    // Load initial state if provided
    if (canvasState) {
      canvas.loadFromJSON(canvasState).then(() => {
        canvas.renderAll();
      });
    }

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      canvas.dispose();
    };
  }, []); // Only run once on mount

  // Update canvas from external state changes
  useEffect(() => {
    if (!fabricCanvasRef.current || !canvasState) return;

    const currentJson = JSON.stringify(fabricCanvasRef.current.toJSON());
    const newJson = JSON.stringify(canvasState);

    // Only update if state actually changed
    if (currentJson !== newJson) {
      fabricCanvasRef.current.loadFromJSON(canvasState).then(() => {
        fabricCanvasRef.current.renderAll();
      });
    }
  }, [canvasState]);

  // Update drawing permissions
  useEffect(() => {
    if (!fabricCanvasRef.current) return;

    const canDraw = !disabled && (!isStudent || studentCanDraw);
    fabricCanvasRef.current.isDrawingMode = canDraw && tool === 'pen';
    fabricCanvasRef.current.selection = canDraw;
    fabricCanvasRef.current.forEachObject(obj => {
      obj.selectable = canDraw;
      obj.evented = canDraw;
    });
    fabricCanvasRef.current.renderAll();
  }, [studentCanDraw, isStudent, disabled, tool]);

  // Tool handlers
  const handleToolChange = (newTool) => {
    if (disabled || (isStudent && !studentCanDraw)) return;

    setTool(newTool);
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (newTool === 'pen') {
      canvas.isDrawingMode = true;
    } else {
      canvas.isDrawingMode = false;
    }
  };

  const handleAddCircle = () => {
    if (disabled || (isStudent && !studentCanDraw)) return;

    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const circle = new Circle({
      left: 100,
      top: 100,
      radius: 50,
      fill: 'transparent',
      stroke: '#000000',
      strokeWidth: 2
    });

    canvas.add(circle);
    canvas.setActiveObject(circle);
  };

  const handleAddRect = () => {
    if (disabled || (isStudent && !studentCanDraw)) return;

    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const rect = new Rect({
      left: 100,
      top: 100,
      width: 100,
      height: 100,
      fill: 'transparent',
      stroke: '#000000',
      strokeWidth: 2
    });

    canvas.add(rect);
    canvas.setActiveObject(rect);
  };

  const handleAddLine = () => {
    if (disabled || (isStudent && !studentCanDraw)) return;

    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const line = new Line([50, 100, 200, 200], {
      stroke: '#000000',
      strokeWidth: 2
    });

    canvas.add(line);
    canvas.setActiveObject(line);
  };

  const handleClear = () => {
    if (disabled || (isStudent && !studentCanDraw)) return;

    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (window.confirm('Clear the entire canvas?')) {
      canvas.clear();
      canvas.backgroundColor = '#ffffff';
      canvas.renderAll();
    }
  };

  const handleUndo = () => {
    if (disabled || (isStudent && !studentCanDraw)) return;

    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const objects = canvas.getObjects();
    if (objects.length > 0) {
      canvas.remove(objects[objects.length - 1]);
      canvas.renderAll();
    }
  };

  const canInteract = !disabled && (!isStudent || studentCanDraw);

  return (
    <div className="collaboration-canvas-container">
      <div className="canvas-toolbar">
        <button
          className={`tool-btn ${tool === 'pen' ? 'active' : ''}`}
          onClick={() => handleToolChange('pen')}
          disabled={!canInteract}
          title="Pen"
        >
          ✏️
        </button>
        <button
          className="tool-btn"
          onClick={handleAddCircle}
          disabled={!canInteract}
          title="Circle"
        >
          ⭕
        </button>
        <button
          className="tool-btn"
          onClick={handleAddRect}
          disabled={!canInteract}
          title="Rectangle"
        >
          ⬜
        </button>
        <button
          className="tool-btn"
          onClick={handleAddLine}
          disabled={!canInteract}
          title="Line"
        >
          ➖
        </button>
        <div className="toolbar-separator" />
        <button
          className="tool-btn"
          onClick={handleUndo}
          disabled={!canInteract}
          title="Undo"
        >
          ↶
        </button>
        <button
          className="tool-btn"
          onClick={handleClear}
          disabled={!canInteract}
          title="Clear"
        >
          🗑️
        </button>
        {isStudent && !studentCanDraw && (
          <div className="permission-indicator">
            Drawing disabled by teacher
          </div>
        )}
      </div>
      <div className="canvas-wrapper">
        <canvas ref={canvasRef} className="collaboration-canvas" />
      </div>
    </div>
  );
}
