import { useEffect, useRef, useState } from 'react';
import './CollaborationCanvas.css';

/**
 * Collaboration Canvas Component
 * Native HTML5 Canvas with operation-based syncing
 * Instead of syncing entire canvas state, we sync individual drawing operations
 */
export function CollaborationCanvas({ 
  canvasState, 
  onCanvasUpdate, 
  studentCanDraw = true,
  isStudent = false,
  disabled = false 
}) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(3);
  const operationsRef = useRef([]); // Store all drawing operations
  const processedOperationsRef = useRef(new Set()); // Track which operations we've already processed
  const lastSyncedVersionRef = useRef(0); // Track last synced version
  const pendingOperationsRef = useRef([]); // Operations waiting to be synced

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;

    // Set canvas size
    canvas.width = 800;
    canvas.height = 600;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Load initial operations if provided
    if (canvasState && Array.isArray(canvasState.operations)) {
      operationsRef.current = canvasState.operations;
      // Mark all initial operations as processed
      canvasState.operations.forEach(op => {
        if (op.id) {
          processedOperationsRef.current.add(op.id);
        }
      });
      redrawCanvas();
    }

    return () => {
      // Cleanup if needed
    };
  }, []);

  // Redraw canvas from operations
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Redraw all operations
    operationsRef.current.forEach(op => {
      applyOperation(op, false); // false = don't trigger sync
    });
  };

  // Apply a drawing operation
  const applyOperation = (operation, shouldSync = true) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const { type, data, id } = operation;

    // Skip if we've already processed this operation (prevent duplicates)
    if (id && processedOperationsRef.current.has(id)) {
      return;
    }

    // Set drawing styles
    ctx.strokeStyle = data.color || '#000000';
    ctx.lineWidth = data.lineWidth || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Apply the operation
    switch (type) {
      case 'draw':
        ctx.beginPath();
        ctx.moveTo(data.x0, data.y0);
        ctx.lineTo(data.x1, data.y1);
        ctx.stroke();
        break;

      case 'clear':
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        // Clear operations list when clearing (only when applying external clear)
        if (!shouldSync) {
          operationsRef.current = [operation];
          processedOperationsRef.current.clear();
          processedOperationsRef.current.add(operation.id);
        }
        break;
    }

    // Mark this operation as processed
    if (id) {
      processedOperationsRef.current.add(id);
    }

    // Don't sync when applying external operations (they're already synced)
    if (!shouldSync) {
      // But still add to our operations list so we can rebuild the canvas
      if (!operationsRef.current.some(op => op.id === id)) {
        operationsRef.current.push(operation);
      }
      return;
    }

    // Add to operations list and sync (only for local operations)
    if (!operationsRef.current.some(op => op.id === id)) {
      operationsRef.current.push(operation);
      pendingOperationsRef.current.push(operation);
    }
    
    // Sync with debouncing - send only new operations to avoid payload size issues
    if (onCanvasUpdate) {
      clearTimeout(window.canvasSyncTimeout);
      window.canvasSyncTimeout = setTimeout(() => {
        // Send full operations list but with a size limit
        const operations = operationsRef.current;
        const operationsJson = JSON.stringify(operations);
        
        // If operations list is getting too large, keep only the most recent ones
        // This prevents payload size issues and keeps performance good
        const MAX_OPERATIONS = 5000; // Keep last 5000 operations
        const MAX_SIZE = 5000000; // 5MB limit
        
        if (operations.length > MAX_OPERATIONS || operationsJson.length > MAX_SIZE) {
          // Keep last MAX_OPERATIONS operations
          const recentOperations = operations.slice(-MAX_OPERATIONS);
          operationsRef.current = recentOperations;
          
          // Rebuild processed set
          processedOperationsRef.current.clear();
          recentOperations.forEach(op => {
            if (op.id) processedOperationsRef.current.add(op.id);
          });
          
          // Redraw canvas with reduced operations
          redrawCanvas();
          
          // Sync with reduced operations
          onCanvasUpdate({
            operations: recentOperations,
            version: Date.now(),
            truncated: true
          });
        } else {
          // Normal sync with all operations
          onCanvasUpdate({
            operations: operations,
            version: Date.now()
          });
        }
        
        // Clear pending operations after sync
        pendingOperationsRef.current = [];
      }, 500);
    }
  };

  // Handle drawing start
  const handleMouseDown = (e) => {
    if (disabled || (isStudent && !studentCanDraw) || tool !== 'pen') return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setLastPos({ x, y });
  };

  // Handle drawing move
  const handleMouseMove = (e) => {
    if (!isDrawing || disabled || (isStudent && !studentCanDraw) || tool !== 'pen') return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Throttle drawing operations to reduce payload size
    // Only create operation if moved significant distance (reduces number of operations)
    const dx = x - lastPos.x;
    const dy = y - lastPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Always draw locally for smooth appearance
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPos.x, lastPos.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    
    // Only create operation if moved at least 2 pixels (reduces operations for fast drawing)
    if (distance < 2) {
      setLastPos({ x, y });
      return;
    }

    const operation = {
      type: 'draw',
      id: `draw_${Date.now()}_${Math.random()}`,
      data: {
        x0: lastPos.x,
        y0: lastPos.y,
        x1: x,
        y1: y,
        color,
        lineWidth
      }
    };

    applyOperation(operation);
    setLastPos({ x, y });
  };

  // Handle drawing end
  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  // Handle external operations (from other user)
  useEffect(() => {
    if (!canvasState || !canvasState.operations) return;

    // Get all operation IDs we've already processed
    const processedIds = processedOperationsRef.current;
    
    // Find operations we haven't processed yet
    const newOperations = canvasState.operations.filter(op => {
      if (!op.id) return false; // Skip operations without IDs
      return !processedIds.has(op.id);
    });

    if (newOperations.length > 0) {
      // Check if there's a clear operation - if so, handle it specially
      const clearOp = newOperations.find(op => op.type === 'clear');
      if (clearOp) {
        // Clear everything immediately without syncing back
        const ctx = ctxRef.current;
        const canvas = canvasRef.current;
        if (ctx && canvas) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        operationsRef.current = [clearOp];
        processedOperationsRef.current.clear();
        processedOperationsRef.current.add(clearOp.id);
        return;
      }
      
      // Apply new operations in order
      newOperations.forEach(op => {
        applyOperation(op, false); // false = don't sync (it's already synced)
      });
    }
  }, [canvasState]);

  // Tool handlers (only pen tool now)
  const handleToolChange = (newTool) => {
    if (disabled || (isStudent && !studentCanDraw)) return;
    setTool(newTool);
  };


  const handleClear = () => {
    if (disabled || (isStudent && !studentCanDraw)) return;

    if (window.confirm('Clear the entire canvas?')) {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      
      // Clear canvas immediately (don't wait for backend)
      if (ctx && canvas) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      // Create clear operation
      const operation = {
        type: 'clear',
        id: `clear_${Date.now()}_${Math.random()}`,
        data: {}
      };

      // Reset operations list and tracking
      operationsRef.current = [operation];
      processedOperationsRef.current.clear();
      processedOperationsRef.current.add(operation.id);
      
      // Sync clear operation to backend (but don't wait for response)
      if (onCanvasUpdate) {
        onCanvasUpdate({
          operations: [operation],
          version: Date.now()
        });
      }
    }
  };

  const handleUndo = () => {
    if (disabled || (isStudent && !studentCanDraw)) return;

    if (operationsRef.current.length > 0) {
      operationsRef.current.pop();
      redrawCanvas();
      
      // Sync after undo
      if (onCanvasUpdate) {
        onCanvasUpdate({
          operations: operationsRef.current,
          version: Date.now()
        });
      }
    }
  };

  const canInteract = !disabled && (!isStudent || studentCanDraw);

  return (
    <div className="collaboration-canvas-container">
      <div className="canvas-toolbar">
        <div className="toolbar-label">Drawing Tools</div>
        <button
          className={`tool-btn ${tool === 'pen' ? 'active' : ''}`}
          onClick={() => handleToolChange('pen')}
          disabled={!canInteract}
          title="Pen"
        >
          ✏️ Pen
        </button>
        <div className="toolbar-separator" />
        <button
          className="tool-btn"
          onClick={handleUndo}
          disabled={!canInteract}
          title="Undo"
        >
          ↶ Undo
        </button>
        <button
          className="tool-btn"
          onClick={handleClear}
          disabled={!canInteract}
          title="Clear"
        >
          🗑️ Clear
        </button>
        {isStudent && !studentCanDraw && (
          <div className="permission-indicator">
            Drawing disabled by teacher
          </div>
        )}
      </div>
      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          className="collaboration-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
    </div>
  );
}
