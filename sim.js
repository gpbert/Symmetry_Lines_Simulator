// sim.js — Data model, state, business logic, and validation for the Symmetry Line Simulator

// ============================================================
// Constants
// ============================================================
export const GRID_SIZE_EXTERNAL = 300; // mm - 300mm grid external
export const GRID_SIZE_INTERNAL = 100; // mm - 100mm internal
export const COLUMN_SIZE = 100; // mm - 10x10cm steel column
export const MIN_WALL_LENGTH = 400; // mm - manufacturable minimum
export const WALL_LENGTH_GRID = 300; // mm - wall lengths snap to 300mm grid (first valid snap is 600mm since 300 < 400)
export const MIN_DISTANCE_PARALLEL = 600; // mm
export const MIN_DISTANCE_OPPOSITE = 1200; // mm
export const VOID_GRID = 600; // mm - voids snap to 600mm grid
export const MIN_VOID_SIZE = 600; // mm - minimum void dimension
export const MAX_HISTORY = 50; // Keep last 50 operations

// ============================================================
// Wall class
// ============================================================
export class Wall {
    constructor(ax, ay, bx, by, thickness = 200, height = 2700, groupId = null, floorId = 0) {
        // Points A and B ARE on the INTERNAL face (blue line - grid-aligned with columns)
        // The user draws on the grid lines, which become the internal face
        this.pointA = { x: ax, y: ay }; // Internal face point A (blue line, grid-aligned)
        this.pointB = { x: bx, y: by }; // Internal face point B (blue line, grid-aligned)
        this.thickness = thickness; // mm
        this.height = height; // mm
        this.groupId = groupId; // For tracking segments of the same wall
        this.floorId = floorId; // Which floor this wall belongs to
        this.updateVectors();
    }

    updateVectors() {
        // Direction vector d = AB
        this.d = {
            x: this.pointB.x - this.pointA.x,
            y: this.pointB.y - this.pointA.y
        };

        // Length
        this.length = Math.sqrt(this.d.x * this.d.x + this.d.y * this.d.y);

        // Normalized direction (handle zero-length case)
        if (this.length > 0) {
            this.dNorm = {
                x: this.d.x / this.length,
                y: this.d.y / this.length
            };
        } else {
            // Default to horizontal for zero-length walls
            this.dNorm = { x: 1, y: 0 };
        }

        // Normal vector n (perpendicular, pointing INWARD from external face)
        // Right-hand cross product: up × d
        this.n = {
            x: -this.dNorm.y,
            y: this.dNorm.x
        };
    }

    getExternalFacePoints() {
        // External face is thickness distance outward from internal face (A and B)
        return {
            a: {
                x: this.pointA.x + this.n.x * this.thickness,
                y: this.pointA.y + this.n.y * this.thickness
            },
            b: {
                x: this.pointB.x + this.n.x * this.thickness,
                y: this.pointB.y + this.n.y * this.thickness
            }
        };
    }

    getInternalFacePoints() {
        // Internal face IS points A and B (for backward compatibility)
        return {
            a: this.pointA,
            b: this.pointB
        };
    }

    isParallelTo(other) {
        const dot = Math.abs(this.dNorm.x * other.dNorm.x + this.dNorm.y * other.dNorm.y);
        return dot > 0.999; // Almost parallel
    }

    isPerpendicularTo(other) {
        const dot = Math.abs(this.dNorm.x * other.dNorm.x + this.dNorm.y * other.dNorm.y);
        return dot < 0.1; // Almost perpendicular
    }

    sameOrientation(other) {
        const dot = this.dNorm.x * other.dNorm.x + this.dNorm.y * other.dNorm.y;
        return dot > 0.9;
    }

    oppositeOrientation(other) {
        const dot = this.dNorm.x * other.dNorm.x + this.dNorm.y * other.dNorm.y;
        return dot < -0.9;
    }

    overlapsInProjection(other) {
        // Project both walls onto the line direction
        const dir = this.dNorm;

        const a1 = this.pointA.x * dir.x + this.pointA.y * dir.y;
        const b1 = this.pointB.x * dir.x + this.pointB.y * dir.y;
        const min1 = Math.min(a1, b1);
        const max1 = Math.max(a1, b1);

        const a2 = other.pointA.x * dir.x + other.pointA.y * dir.y;
        const b2 = other.pointB.x * dir.x + other.pointB.y * dir.y;
        const min2 = Math.min(a2, b2);
        const max2 = Math.max(a2, b2);

        // Allow touching at endpoints (use <= to exclude touching walls)
        // Add small tolerance for floating point comparisons
        const tolerance = 1; // 1mm tolerance
        return !(max1 <= min2 + tolerance || max2 <= min1 + tolerance);
    }

    distanceToWall(other) {
        // Calculate minimum distance between INTERNAL faces (blue lines - column face to column face)
        // v3: Fixed to use infinite line distance for parallel walls - 2024

        // For parallel walls, calculate perpendicular distance between the infinite lines
        if (this.isParallelTo(other)) {
            const internal1 = this.getInternalFacePoints();
            const internal2 = other.getInternalFacePoints();

            // For parallel lines, perpendicular distance is constant everywhere
            // Use cross product method: distance = |ax + by + c| / sqrt(a² + b²)
            // Or simpler: use perpendicular vector

            // Get direction vector of wall 2
            const dx = internal2.b.x - internal2.a.x;
            const dy = internal2.b.y - internal2.a.y;
            const len = Math.sqrt(dx * dx + dy * dy);

            if (len === 0) {
                return Math.sqrt(
                    (internal1.a.x - internal2.a.x) ** 2 +
                    (internal1.a.y - internal2.a.y) ** 2
                );
            }

            // For parallel lines, use the cross product formula
            // Distance = |cross product| / |direction vector|
            // For 2D: |(x - x0) × direction| / |direction|
            // = |dx * (py - y0) - dy * (px - x0)| / sqrt(dx² + dy²)

            const px = internal1.a.x;
            const py = internal1.a.y;
            const x0 = internal2.a.x;
            const y0 = internal2.a.y;

            const crossProduct = Math.abs(dx * (py - y0) - dy * (px - x0));
            const distance = crossProduct / len;
            return distance;
        }

        // For non-parallel walls, calculate minimum distance between segments
        const internal1 = this.getInternalFacePoints();
        const internal2 = other.getInternalFacePoints();

        const distances = [
            this.pointToLineDistance(internal1.a, internal2.a, internal2.b),
            this.pointToLineDistance(internal1.b, internal2.a, internal2.b),
            this.pointToLineDistance(internal2.a, internal1.a, internal1.b),
            this.pointToLineDistance(internal2.b, internal1.a, internal1.b)
        ];

        return Math.min(...distances);
    }

    pointToLineDistance(point, lineA, lineB) {
        const dx = lineB.x - lineA.x;
        const dy = lineB.y - lineA.y;
        const lenSq = dx * dx + dy * dy;

        if (lenSq === 0) return Math.sqrt(
            (point.x - lineA.x) ** 2 + (point.y - lineA.y) ** 2
        );

        let t = ((point.x - lineA.x) * dx + (point.y - lineA.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const projX = lineA.x + t * dx;
        const projY = lineA.y + t * dy;

        return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
    }

    containsPoint(x, y, tolerance = 10) {
        const internal = this.getInternalFacePoints();

        // Check if point is within the wall rectangle (with tolerance)
        const dx = this.pointB.x - this.pointA.x;
        const dy = this.pointB.y - this.pointA.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len;
        const ny = dx / len;

        // Create wall rectangle vertices
        const vertices = [
            this.pointA,
            this.pointB,
            internal.b,
            internal.a
        ];

        return this.isPointInPolygon({ x, y }, vertices, tolerance);
    }

    isPointInPolygon(point, vertices, tolerance) {
        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;

            const intersect = ((yi > point.y) !== (yj > point.y))
                && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }

        // Also check distance to edges
        for (let i = 0; i < vertices.length; i++) {
            const j = (i + 1) % vertices.length;
            const dist = this.pointToLineDistance(point, vertices[i], vertices[j]);
            if (dist < tolerance) return true;
        }

        return inside;
    }
}

// ============================================================
// State
// ============================================================
export const state = {
    walls: [],
    voids: [],
    selectedWalls: [],
    selectedVoid: null,
    currentMode: 'draw',
    floors: [{ id: 0, name: 'Level 1', height: 0 }],
    currentFloorId: 0,
    buildingEnvelopes: [],
    newEnvelopeTimestamp: null,
    slabRestrictionsEnabled: false,
    showLevelsBelow: true,
    showLevelsAbove: true,
    history: [],
    redoHistory: [],
    envelopeAngleViolations: [],
    nextVoidId: 1,
};

// ============================================================
// Helper functions
// ============================================================

// Grid snapping - snap to 300mm external grid only
export function snapToGrid(value, gridSize = GRID_SIZE_EXTERNAL) {
    return Math.round(value / gridSize) * gridSize;
}

// Snap to 600mm void grid
export function snapToVoidGrid(value) {
    return Math.round(value / VOID_GRID) * VOID_GRID;
}

// Snap a wall length to the nearest lower multiple of WALL_LENGTH_GRID
export function snapLengthToGrid(startPoint, endPoint) {
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;

    if (Math.abs(dx) > Math.abs(dy)) {
        const rawLength = Math.abs(dx);
        const snappedLength = Math.floor(rawLength / WALL_LENGTH_GRID) * WALL_LENGTH_GRID;
        if (snappedLength < MIN_WALL_LENGTH) return { x: startPoint.x, y: startPoint.y };
        const direction = dx > 0 ? 1 : -1;
        return { x: startPoint.x + direction * snappedLength, y: startPoint.y };
    } else {
        const rawLength = Math.abs(dy);
        const snappedLength = Math.floor(rawLength / WALL_LENGTH_GRID) * WALL_LENGTH_GRID;
        if (snappedLength < MIN_WALL_LENGTH) return { x: startPoint.x, y: startPoint.y };
        const direction = dy > 0 ? 1 : -1;
        return { x: startPoint.x, y: startPoint.y + direction * snappedLength };
    }
}

// Void ID generator
export function generateVoidId() {
    return 'void-' + (state.nextVoidId++);
}

// Get void at a given point on a given floor
export function getVoidAtPoint(x, y, floorId) {
    for (let i = state.voids.length - 1; i >= 0; i--) {
        const v = state.voids[i];
        if (v.floorId !== floorId) continue;
        if (x >= v.x && x <= v.x + v.width && y >= v.y && y <= v.y + v.height) {
            return v;
        }
    }
    return null;
}

// Get resize handle for a void
export function getVoidResizeHandle(pos, v) {
    if (!v) return null;
    const tolerance = 150; // mm
    const handles = [
        { x: v.x, y: v.y, handle: 'nw' },
        { x: v.x + v.width / 2, y: v.y, handle: 'n' },
        { x: v.x + v.width, y: v.y, handle: 'ne' },
        { x: v.x + v.width, y: v.y + v.height / 2, handle: 'e' },
        { x: v.x + v.width, y: v.y + v.height, handle: 'se' },
        { x: v.x + v.width / 2, y: v.y + v.height, handle: 's' },
        { x: v.x, y: v.y + v.height, handle: 'sw' },
        { x: v.x, y: v.y + v.height / 2, handle: 'w' },
    ];
    for (const h of handles) {
        const dist = Math.sqrt(Math.pow(pos.x - h.x, 2) + Math.pow(pos.y - h.y, 2));
        if (dist < tolerance) return h.handle;
    }
    return null;
}

// Helper function to check if a point is near a wall endpoint
export function getEndpointNearPoint(x, y, threshold = 20, zoomLevel = 1) {
    // Transform threshold to world coordinates
    const worldThreshold = threshold / zoomLevel;

    for (let wall of state.walls) {
        // Only check walls on current floor
        if (wall.floorId !== state.currentFloorId) continue;

        // Check point A
        const distA = Math.sqrt(
            Math.pow(x - wall.pointA.x, 2) +
            Math.pow(y - wall.pointA.y, 2)
        );
        if (distA < worldThreshold) {
            return { wall, endpoint: 'A' };
        }

        // Check point B
        const distB = Math.sqrt(
            Math.pow(x - wall.pointB.x, 2) +
            Math.pow(y - wall.pointB.y, 2)
        );
        if (distB < worldThreshold) {
            return { wall, endpoint: 'B' };
        }
    }
    return null;
}

// ============================================================
// Undo/Redo system
// ============================================================

// Add items to history
export function addToHistory(addedItems = [], objectType = 'wall') {
    const operation = {
        objectType: objectType,
        items: addedItems,
        timestamp: Date.now()
    };
    if (objectType === 'wall') {
        // If no walls provided, save current state for undo
        const wallsToSave = addedItems.length > 0 ? addedItems : [...state.walls];
        operation.walls = wallsToSave;
        operation.wallIndices = wallsToSave.map(w => state.walls.indexOf(w));
    } else if (objectType === 'void') {
        operation.voidIndices = addedItems.map(v => state.voids.indexOf(v));
        operation.voids = addedItems;
    }
    state.history.push(operation);
    state.redoHistory = [];
    if (state.history.length > MAX_HISTORY) {
        state.history.shift();
    }
}

// Add a void deletion operation to history
export function addVoidDeletionToHistory(deletedVoid) {
    const operation = {
        objectType: 'void-delete',
        voidData: {
            id: deletedVoid.id,
            floorId: deletedVoid.floorId,
            x: deletedVoid.x,
            y: deletedVoid.y,
            width: deletedVoid.width,
            height: deletedVoid.height
        },
        timestamp: Date.now()
    };
    state.history.push(operation);
    state.redoHistory = [];
    if (state.history.length > MAX_HISTORY) state.history.shift();
}

// Undo functionality
export function undo(onComplete) {
    if (state.history.length === 0) {
        if (onComplete) onComplete('empty');
        return;
    }
    const lastOperation = state.history.pop();
    if (lastOperation.objectType === 'void') {
        lastOperation.voids.forEach(v => {
            const idx = state.voids.indexOf(v);
            if (idx !== -1) state.voids.splice(idx, 1);
        });
        state.selectedVoid = null;
    } else if (lastOperation.objectType === 'void-delete') {
        const vd = lastOperation.voidData;
        state.voids.push({ id: vd.id, floorId: vd.floorId, x: vd.x, y: vd.y, width: vd.width, height: vd.height });
        state.selectedVoid = null;
    } else if (lastOperation.objectType === 'void-resize') {
        const v = lastOperation.voidRef;
        v.x = lastOperation.oldState.x;
        v.y = lastOperation.oldState.y;
        v.width = lastOperation.oldState.width;
        v.height = lastOperation.oldState.height;
        state.selectedVoid = null;
    } else {
        lastOperation.wallIndices.forEach(index => {
            const wallIndex = state.walls.indexOf(lastOperation.walls[lastOperation.wallIndices.indexOf(index)]);
            if (wallIndex !== -1) state.walls.splice(wallIndex, 1);
        });
        state.selectedWalls = [];
    }
    state.redoHistory.push(lastOperation);
    if (state.redoHistory.length > MAX_HISTORY) state.redoHistory.shift();
    if (onComplete) onComplete('done');
}

// Redo functionality
export function redo(onComplete) {
    if (state.redoHistory.length === 0) {
        if (onComplete) onComplete('empty');
        return;
    }
    const operation = state.redoHistory.pop();
    if (operation.objectType === 'void') {
        operation.voids.forEach(v => state.voids.push(v));
    } else if (operation.objectType === 'void-delete') {
        const idx = state.voids.findIndex(v => v.id === operation.voidData.id);
        if (idx !== -1) state.voids.splice(idx, 1);
    } else if (operation.objectType === 'void-resize') {
        const v = operation.voidRef;
        v.x = operation.newState.x;
        v.y = operation.newState.y;
        v.width = operation.newState.width;
        v.height = operation.newState.height;
    } else {
        operation.walls.forEach(wall => state.walls.push(wall));
    }
    // Push directly to history (do NOT call addToHistory — it clears redoHistory)
    state.history.push(operation);
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.selectedWalls = [];
    state.selectedVoid = null;
    if (onComplete) onComplete('done');
}

// ============================================================
// Envelope detection and slab system logic
// ============================================================

// Detect building envelopes (closed loops of wall internal faces) on a given floor
export function detectBuildingEnvelopes(floorId) {
    const floorWalls = state.walls.filter(w => w.floorId === floorId);
    if (floorWalls.length < 3) return []; // Need at least 3 walls to form a loop

    const ENDPOINT_TOLERANCE = 2; // mm - walls must be within 2mm to be considered connected

    // Build a graph of connections between wall endpoints
    // Each node is a point, edges connect to walls that share that point
    const graph = new Map(); // Map<pointKey, Set<wallIndex>>

    const pointKey = (x, y) => `${Math.round(x)},${Math.round(y)}`;

    floorWalls.forEach((wall, idx) => {
        const keyA = pointKey(wall.pointA.x, wall.pointA.y);
        const keyB = pointKey(wall.pointB.x, wall.pointB.y);

        if (!graph.has(keyA)) graph.set(keyA, new Set());
        if (!graph.has(keyB)) graph.set(keyB, new Set());

        graph.get(keyA).add(idx);
        graph.get(keyB).add(idx);
    });

    // Find all closed loops using DFS
    const loops = [];
    const visited = new Set();

    function findLoop(startWallIdx, currentWallIdx, path, visitedWalls, wallIndices) {
        if (visitedWalls.has(currentWallIdx)) {
            // Check if we've completed a loop back to start
            if (currentWallIdx === startWallIdx && path.length >= 3) {
                return { path: path.slice(), indices: Array.from(wallIndices) };
            }
            return null;
        }

        visitedWalls.add(currentWallIdx);
        wallIndices.add(currentWallIdx);
        const currentWall = floorWalls[currentWallIdx];

        // Determine which endpoint to continue from
        const lastPoint = path.length > 0 ? path[path.length - 1] : null;
        let nextPoint;

        if (!lastPoint) {
            // First wall - start from pointA, go to pointB
            path.push({ x: currentWall.pointA.x, y: currentWall.pointA.y });
            nextPoint = currentWall.pointB;
        } else {
            // Determine which end connects to the last point
            const distToA = Math.sqrt(
                Math.pow(lastPoint.x - currentWall.pointA.x, 2) +
                Math.pow(lastPoint.y - currentWall.pointA.y, 2)
            );
            const distToB = Math.sqrt(
                Math.pow(lastPoint.x - currentWall.pointB.x, 2) +
                Math.pow(lastPoint.y - currentWall.pointB.y, 2)
            );

            if (distToA < ENDPOINT_TOLERANCE) {
                nextPoint = currentWall.pointB;
            } else if (distToB < ENDPOINT_TOLERANCE) {
                nextPoint = currentWall.pointA;
            } else {
                // Not connected
                visitedWalls.delete(currentWallIdx);
                return null;
            }
        }

        path.push({ x: nextPoint.x, y: nextPoint.y });

        // Find walls connected to nextPoint
        const nextKey = pointKey(nextPoint.x, nextPoint.y);
        const connectedWalls = graph.get(nextKey);

        if (!connectedWalls) {
            visitedWalls.delete(currentWallIdx);
            return null;
        }

        // Try each connected wall
        for (let wallIdx of connectedWalls) {
            if (wallIdx === currentWallIdx) continue; // Skip current wall

            // Check if this completes the loop
            if (wallIdx === startWallIdx && path.length >= 4) {
                // Completed loop! Remove the duplicate last point
                return { path: path.slice(0, -1), indices: Array.from(wallIndices) };
            }

            if (!visitedWalls.has(wallIdx)) {
                const result = findLoop(startWallIdx, wallIdx, path, new Set(visitedWalls), new Set(wallIndices));
                if (result) {
                    return result;
                }
            }
        }

        // Backtrack
        path.pop();
        path.pop();
        visitedWalls.delete(currentWallIdx);
        return null;
    }

    // Try starting from each wall
    for (let i = 0; i < floorWalls.length; i++) {
        if (visited.has(i)) continue;

        const result = findLoop(i, i, [], new Set(), new Set());
        if (result && result.path && result.path.length >= 3) {
            loops.push({ path: result.path, indices: result.indices });
            // Mark ALL walls in this loop as visited to prevent duplicates
            result.indices.forEach(idx => visited.add(idx));
        }
    }

    return loops;
}

// Update building envelopes for all floors
export function updateBuildingEnvelopes(onComplete) {
    const previousCount = state.buildingEnvelopes.length;
    state.buildingEnvelopes = [];

    // Detect envelopes on each floor
    state.floors.forEach(floor => {
        const floorWalls = state.walls.filter(w => w.floorId === floor.id);
        const loops = detectBuildingEnvelopes(floor.id);
        loops.forEach(loopResult => {
            state.buildingEnvelopes.push({
                floorId: floor.id,
                polygon: loopResult.path,
                wallIndices: loopResult.indices.map(localIdx => state.walls.indexOf(floorWalls[localIdx])),
                timestamp: Date.now()
            });
        });
    });

    const newCount = state.buildingEnvelopes.length;

    // Return change info so the caller can show toasts
    const changeInfo = { previousCount, newCount };

    if (onComplete) onComplete(changeInfo);

    return changeInfo;
}

// Check if a point is on or very close to a line segment
export function pointNearLineSegment(point, lineStart, lineEnd, tolerance = 5) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) return Math.sqrt(
        Math.pow(point.x - lineStart.x, 2) +
        Math.pow(point.y - lineStart.y, 2)
    ) < tolerance;

    const t = Math.max(0, Math.min(1,
        ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (length * length)
    ));

    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;

    const dist = Math.sqrt(
        Math.pow(point.x - projX, 2) +
        Math.pow(point.y - projY, 2)
    );

    return dist < tolerance;
}

// Check if a point is inside a polygon (ray casting algorithm)
export function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        const intersect = ((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Get which envelope(s) a wall belongs to on its floor
export function getWallSlabSystem(wall) {
    const envelopeIndices = [];

    state.buildingEnvelopes.forEach((envelope, idx) => {
        // Only check envelopes on the same floor
        if (envelope.floorId !== wall.floorId) return;

        // Check if both wall endpoints are part of this envelope's polygon edges
        const pointAInEnvelope = envelope.polygon.some((p, i) => {
            const nextP = envelope.polygon[(i + 1) % envelope.polygon.length];
            return pointNearLineSegment(wall.pointA, p, nextP, 5);
        });

        const pointBInEnvelope = envelope.polygon.some((p, i) => {
            const nextP = envelope.polygon[(i + 1) % envelope.polygon.length];
            return pointNearLineSegment(wall.pointB, p, nextP, 5);
        });

        // If endpoints are on the polygon boundary, wall is part of envelope
        if (pointAInEnvelope && pointBInEnvelope) {
            envelopeIndices.push(idx);
        }
        // Also check if wall is inside the envelope (for preview walls during drawing)
        else if (pointInPolygon(wall.pointA, envelope.polygon) ||
                 pointInPolygon(wall.pointB, envelope.polygon)) {
            envelopeIndices.push(idx);
        }
    });

    return envelopeIndices;
}

// Check if two polygons overlap (for cross-floor envelope connection)
export function envelopesOverlap(envelope1, envelope2) {
    // Quick bounding box check
    const bbox1 = {
        minX: Math.min(...envelope1.polygon.map(p => p.x)),
        maxX: Math.max(...envelope1.polygon.map(p => p.x)),
        minY: Math.min(...envelope1.polygon.map(p => p.y)),
        maxY: Math.max(...envelope1.polygon.map(p => p.y))
    };

    const bbox2 = {
        minX: Math.min(...envelope2.polygon.map(p => p.x)),
        maxX: Math.max(...envelope2.polygon.map(p => p.x)),
        minY: Math.min(...envelope2.polygon.map(p => p.y)),
        maxY: Math.max(...envelope2.polygon.map(p => p.y))
    };

    // If bounding boxes don't overlap, polygons don't overlap
    if (bbox1.maxX < bbox2.minX || bbox2.maxX < bbox1.minX ||
        bbox1.maxY < bbox2.minY || bbox2.maxY < bbox1.minY) {
        return false;
    }

    // Check if any point of envelope1 is in envelope2
    for (let point of envelope1.polygon) {
        if (pointInPolygon(point, envelope2.polygon)) return true;
    }

    // Check if any point of envelope2 is in envelope1
    for (let point of envelope2.polygon) {
        if (pointInPolygon(point, envelope1.polygon)) return true;
    }

    // Check for edge intersections
    function lineSegmentsIntersect(p1, p2, p3, p4) {
        const ccw = (A, B, C) => (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
        return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
    }

    for (let i = 0; i < envelope1.polygon.length; i++) {
        const p1 = envelope1.polygon[i];
        const p2 = envelope1.polygon[(i + 1) % envelope1.polygon.length];

        for (let j = 0; j < envelope2.polygon.length; j++) {
            const p3 = envelope2.polygon[j];
            const p4 = envelope2.polygon[(j + 1) % envelope2.polygon.length];

            if (lineSegmentsIntersect(p1, p2, p3, p4)) return true;
        }
    }

    return false;
}

// Build connected slab systems using union-find across floors
export function getConnectedSlabSystems() {
    if (state.buildingEnvelopes.length === 0) return new Map();

    // Union-Find data structure
    const parent = new Map();
    const rank = new Map();

    // Initialize each envelope as its own parent
    state.buildingEnvelopes.forEach((_, idx) => {
        parent.set(idx, idx);
        rank.set(idx, 0);
    });

    function find(x) {
        if (parent.get(x) !== x) {
            parent.set(x, find(parent.get(x))); // Path compression
        }
        return parent.get(x);
    }

    function union(x, y) {
        const rootX = find(x);
        const rootY = find(y);

        if (rootX === rootY) return;

        // Union by rank
        if (rank.get(rootX) < rank.get(rootY)) {
            parent.set(rootX, rootY);
        } else if (rank.get(rootX) > rank.get(rootY)) {
            parent.set(rootY, rootX);
        } else {
            parent.set(rootY, rootX);
            rank.set(rootX, rank.get(rootX) + 1);
        }
    }

    // Connect envelopes on consecutive floors that overlap
    for (let i = 0; i < state.buildingEnvelopes.length; i++) {
        for (let j = i + 1; j < state.buildingEnvelopes.length; j++) {
            const env1 = state.buildingEnvelopes[i];
            const env2 = state.buildingEnvelopes[j];

            // Check if on consecutive floors
            const floorDiff = Math.abs(env1.floorId - env2.floorId);
            if (floorDiff === 1) {
                // Check if they overlap
                if (envelopesOverlap(env1, env2)) {
                    union(i, j);
                }
            }
        }
    }

    // Build map of envelope index to system ID
    const systemMap = new Map();
    state.buildingEnvelopes.forEach((_, idx) => {
        systemMap.set(idx, find(idx));
    });

    return systemMap;
}

// Check if two walls are in the same slab system (with connection details)
export function areWallsInSameSlabSystem(wall1, wall2, returnDetails = false) {
    // Get envelope indices for both walls
    const env1Indices = getWallSlabSystem(wall1);
    const env2Indices = getWallSlabSystem(wall2);

    // If both walls are orphans (not in any envelope), they're in the same "orphan system"
    if (env1Indices.length === 0 && env2Indices.length === 0) {
        if (returnDetails) {
            return { inSameSystem: true, reason: "Both walls not part of any envelope" };
        }
        return true; // Both orphans
    }

    // If one is orphan and other is not, they're in different systems
    if (env1Indices.length === 0 || env2Indices.length === 0) {
        if (returnDetails) {
            return { inSameSystem: false, reason: "One wall in envelope, other is not" };
        }
        return false;
    }

    // Get connected slab systems
    const systemMap = getConnectedSlabSystems();

    // Check if any envelope from wall1 shares a system with any envelope from wall2
    for (let env1Idx of env1Indices) {
        const system1 = systemMap.get(env1Idx);
        for (let env2Idx of env2Indices) {
            const system2 = systemMap.get(env2Idx);
            if (system1 === system2) {
                if (returnDetails) {
                    // Find the connection path
                    const env1 = state.buildingEnvelopes[env1Idx];
                    const env2 = state.buildingEnvelopes[env2Idx];

                    if (env1.floorId === env2.floorId) {
                        return {
                            inSameSystem: true,
                            reason: `Walls in same envelope on ${state.floors.find(f => f.id === env1.floorId)?.name || 'Level ' + (env1.floorId + 1)}`
                        };
                    } else {
                        // Find which floors are connecting them
                        const minFloor = Math.min(env1.floorId, env2.floorId);
                        const maxFloor = Math.max(env1.floorId, env2.floorId);

                        if (maxFloor - minFloor === 1) {
                            return {
                                inSameSystem: true,
                                reason: `Walls connected via overlapping envelope across ${state.floors.find(f => f.id === minFloor)?.name || 'Level ' + (minFloor + 1)} and ${state.floors.find(f => f.id === maxFloor)?.name || 'Level ' + (maxFloor + 1)}`
                            };
                        } else {
                            return {
                                inSameSystem: true,
                                reason: `Walls connected via envelope chain across multiple floors`
                            };
                        }
                    }
                }
                return true; // Same slab system
            }
        }
    }

    if (returnDetails) {
        return { inSameSystem: false, reason: "Walls in different envelope systems" };
    }
    return false; // Different slab systems
}

// Predictively determine which slab system a preview wall would belong to
export function getPredictedSlabSystemForPreviewWall(previewWall, useEndpoint = false) {
    if (!state.slabRestrictionsEnabled) return null;

    // FIRST: Check if preview wall is beneath/overlapping an envelope on an ADJACENT floor
    // If so, assume it will form part of an envelope in the same slab system
    const adjacentFloorEnvelopes = state.buildingEnvelopes.filter(env =>
        Math.abs(env.floorId - previewWall.floorId) === 1
    );

    // Use endpoint (cursor position) if specified, otherwise use midpoint
    const checkX = useEndpoint ? previewWall.pointB.x : (previewWall.pointA.x + previewWall.pointB.x) / 2;
    const checkY = useEndpoint ? previewWall.pointB.y : (previewWall.pointA.y + previewWall.pointB.y) / 2;

    for (let envelope of adjacentFloorEnvelopes) {
        // Check if the check point is inside this adjacent floor envelope
        if (pointInPolygon({ x: checkX, y: checkY }, envelope.polygon)) {
            console.log('[Predictive] Preview wall is beneath/above an envelope on adjacent floor', envelope.floorId);

            // Get the slab system for this adjacent envelope
            const systemMap = getConnectedSlabSystems();
            const envelopeIdx = state.buildingEnvelopes.indexOf(envelope);

            if (envelopeIdx >= 0 && systemMap.has(envelopeIdx)) {
                const systemId = systemMap.get(envelopeIdx);

                // Build a Set of all envelope indices in the same system
                const envelopesInSystem = new Set();
                systemMap.forEach((sysId, envIdx) => {
                    if (sysId === systemId) {
                        envelopesInSystem.add(envIdx);
                    }
                });

                console.log('[Predictive] Preview wall would be part of slab system with', envelopesInSystem.size, 'envelopes (cross-floor prediction)');
                return {
                    systemEnvelopes: envelopesInSystem,
                    allEnvelopes: state.buildingEnvelopes
                };
            }
        }
    }

    // SECOND: Check if preview wall would be part of EXISTING envelopes on its floor
    // by checking proximity/containment
    const existingEnvelopesOnFloor = state.buildingEnvelopes.filter(env => env.floorId === previewWall.floorId);

    for (let envelope of existingEnvelopesOnFloor) {
        // Check if the check point is inside the envelope polygon
        if (pointInPolygon({ x: checkX, y: checkY }, envelope.polygon)) {
            console.log('[Predictive] Preview wall is inside an existing envelope');

            // Get the slab system for this existing envelope
            const systemMap = getConnectedSlabSystems();
            const envelopeIdx = state.buildingEnvelopes.indexOf(envelope);

            if (envelopeIdx >= 0 && systemMap.has(envelopeIdx)) {
                const systemId = systemMap.get(envelopeIdx);

                // Build a Set of all envelope indices in the same system
                const envelopesInSystem = new Set();
                systemMap.forEach((sysId, envIdx) => {
                    if (sysId === systemId) {
                        envelopesInSystem.add(envIdx);
                    }
                });

                console.log('[Predictive] Preview wall would be part of slab system with', envelopesInSystem.size, 'envelopes');
                return {
                    systemEnvelopes: envelopesInSystem,
                    allEnvelopes: state.buildingEnvelopes
                };
            }
        }

        // Also check if preview wall is very close to envelope boundary (within 100mm)
        for (let i = 0; i < envelope.polygon.length; i++) {
            const p1 = envelope.polygon[i];
            const p2 = envelope.polygon[(i + 1) % envelope.polygon.length];

            if (pointNearLineSegment({ x: checkX, y: checkY }, p1, p2, 100)) {
                console.log('[Predictive] Preview wall is near an existing envelope boundary');

                // Get the slab system for this existing envelope
                const systemMap = getConnectedSlabSystems();
                const envelopeIdx = state.buildingEnvelopes.indexOf(envelope);

                if (envelopeIdx >= 0 && systemMap.has(envelopeIdx)) {
                    const systemId = systemMap.get(envelopeIdx);

                    // Build a Set of all envelope indices in the same system
                    const envelopesInSystem = new Set();
                    systemMap.forEach((sysId, envIdx) => {
                        if (sysId === systemId) {
                            envelopesInSystem.add(envIdx);
                        }
                    });

                    console.log('[Predictive] Preview wall would be part of slab system with', envelopesInSystem.size, 'envelopes');
                    return {
                        systemEnvelopes: envelopesInSystem,
                        allEnvelopes: state.buildingEnvelopes
                    };
                }
            }
        }
    }

    // If not part of existing envelope, check if it would close a NEW envelope
    const originalWalls = [...state.walls];
    state.walls.push(previewWall);

    try {
        // Detect envelopes on the preview wall's floor (with preview wall included)
        const newEnvelopesOnFloor = detectBuildingEnvelopes(previewWall.floorId);
        console.log('[Predictive] Detected', newEnvelopesOnFloor.length, 'envelopes on floor', previewWall.floorId);

        // Check if preview wall is part of any detected envelope
        let previewWallEnvelope = null;
        const previewWallIdx = state.walls.length - 1;

        newEnvelopesOnFloor.forEach((envelope) => {
            // Check if preview wall is on the boundary of this envelope
            const onBoundary = envelope.wallIndices && envelope.wallIndices.includes(previewWallIdx);

            if (onBoundary) {
                previewWallEnvelope = envelope;
                console.log('[Predictive] Preview wall would close a NEW envelope');
            }
        });

        // If preview wall closes a new envelope, determine its slab system
        if (previewWallEnvelope) {
            // Build a complete set of envelopes for slab system calculation:
            // 1. All existing envelopes NOT on preview floor
            // 2. All newly detected envelopes on preview floor (includes preview wall effect)
            const allEnvelopes = state.buildingEnvelopes.filter(env => env.floorId !== previewWall.floorId);

            // Add all detected envelopes on preview floor with proper floorId
            newEnvelopesOnFloor.forEach(env => {
                env.floorId = previewWall.floorId;
                allEnvelopes.push(env);
            });

            // Get connected slab systems with this combined envelope set
            const tempEnvelopes = state.buildingEnvelopes;
            state.buildingEnvelopes = allEnvelopes;
            const systemMap = getConnectedSlabSystems();
            state.buildingEnvelopes = tempEnvelopes;

            // Find the envelope index for the preview wall's envelope in allEnvelopes
            const previewEnvIdx = allEnvelopes.findIndex(env =>
                env === previewWallEnvelope ||
                (env.floorId === previewWall.floorId &&
                 env.wallIndices &&
                 env.wallIndices.includes(previewWallIdx))
            );

            if (previewEnvIdx >= 0 && systemMap.has(previewEnvIdx)) {
                // Get the system ID (root) for this envelope
                const systemId = systemMap.get(previewEnvIdx);

                // Build a Set of all envelope indices in the same system
                const envelopesInSystem = new Set();
                systemMap.forEach((sysId, envIdx) => {
                    if (sysId === systemId) {
                        envelopesInSystem.add(envIdx);
                    }
                });

                console.log('[Predictive] Preview wall would join slab system with', envelopesInSystem.size, 'envelopes');
                return {
                    systemEnvelopes: envelopesInSystem,
                    allEnvelopes: allEnvelopes
                };
            }
        }

        console.log('[Predictive] Preview wall is orphan (not part of any envelope)');
        return null; // Preview wall is orphan

    } finally {
        // Restore original walls array
        state.walls = originalWalls;
    }
}

// ============================================================
// Validation
// ============================================================

// Get restricted zones for a wall (used for rendering)
export function getRestrictedZones(wall) {
    const zones = [];
    const internalY = wall.pointA.y;
    const internalX = wall.pointA.x;
    const isHorizontal = Math.abs(wall.d.y) < Math.abs(wall.d.x);

    if (isHorizontal) {
        const parallelY = internalY + (wall.n.y > 0 ? MIN_DISTANCE_PARALLEL : -MIN_DISTANCE_PARALLEL);
        zones.push({
            type: 'parallel',
            x1: -1e9,
            y1: Math.min(internalY, parallelY),
            x2: 1e9,
            y2: Math.max(internalY, parallelY),
            distance: MIN_DISTANCE_PARALLEL
        });

        const oppositeY = internalY + (wall.n.y > 0 ? -MIN_DISTANCE_OPPOSITE : MIN_DISTANCE_OPPOSITE);
        zones.push({
            type: 'opposite',
            x1: -1e9,
            y1: Math.min(internalY, oppositeY),
            x2: 1e9,
            y2: Math.max(internalY, oppositeY),
            distance: MIN_DISTANCE_OPPOSITE
        });
    } else {
        const parallelX = internalX + (wall.n.x > 0 ? MIN_DISTANCE_PARALLEL : -MIN_DISTANCE_PARALLEL);
        zones.push({
            type: 'parallel',
            x1: Math.min(internalX, parallelX),
            y1: -1e9,
            x2: Math.max(internalX, parallelX),
            y2: 1e9,
            distance: MIN_DISTANCE_PARALLEL
        });

        const oppositeX = internalX + (wall.n.x > 0 ? -MIN_DISTANCE_OPPOSITE : MIN_DISTANCE_OPPOSITE);
        zones.push({
            type: 'opposite',
            x1: Math.min(internalX, oppositeX),
            y1: -1e9,
            x2: Math.max(internalX, oppositeX),
            y2: 1e9,
            distance: MIN_DISTANCE_OPPOSITE
        });
    }

    return zones;
}

export function isWallInRestrictedZone(newWall) {
    // Predictive slab system detection for preview walls
    // Use endpoint (cursor position) for more accurate prediction
    let predictedSlabSystem = null;
    if (state.slabRestrictionsEnabled) {
        predictedSlabSystem = getPredictedSlabSystemForPreviewWall(newWall, true);
    }

    for (let existingWall of state.walls) {
        const onSameFloor = newWall.floorId === existingWall.floorId;
        const onDifferentFloor = newWall.floorId !== existingWall.floorId;

        // Check if walls are perpendicular - no restriction
        if (existingWall.isPerpendicularTo(newWall)) {
            continue;
        }

        // Slab-based restrictions: only affects orphan vs envelope interactions
        if (state.slabRestrictionsEnabled) {
            const existingWallSlabs = getWallSlabSystem(existingWall);
            const previewIsInEnvelope = predictedSlabSystem !== null;

            // Also check if existing wall is beneath an envelope on adjacent floor
            const existingPredictedSystem = getPredictedSlabSystemForPreviewWall(existingWall);
            const existingIsInEnvelope = existingWallSlabs.length > 0 || existingPredictedSystem !== null;

            // ONLY skip if one is orphan and the other is in an envelope
            if (previewIsInEnvelope && !existingIsInEnvelope) {
                continue;
            } else if (!previewIsInEnvelope && existingIsInEnvelope) {
                continue;
            }
        }

        // Check if parallel
        if (existingWall.isParallelTo(newWall)) {
            const dist = newWall.distanceToWall(existingWall);
            const sameOrientation = newWall.sameOrientation(existingWall);
            const sameThickness = Math.abs(newWall.thickness - existingWall.thickness) < 1;
            const hasOverlap = newWall.overlapsInProjection(existingWall);

            // Check for body overlap (critical for cross-floor walls with opposite orientations)
            const maxBodyOverlapDist = newWall.thickness + existingWall.thickness + 10; // +10mm tolerance
            const bodiesOverlap = dist < maxBodyOverlapDist;

            // Same-floor: Check if aligned (internal faces close together)
            if (onSameFloor && dist < 10) {
                // Rule 1: Aligned walls on same floor must share orientation and thickness
                if (!sameOrientation || !sameThickness) {
                    return {
                        restricted: true,
                        wall: existingWall,
                        zone: { distance: 600, reason: 'Same-floor aligned walls must share orientation and thickness' }
                    };
                }
                // Also can't overlap
                if (hasOverlap) {
                    return {
                        restricted: true,
                        wall: existingWall,
                        zone: { distance: 0, reason: 'Same-floor aligned walls cannot overlap' }
                    };
                }
                continue;
            }

            // Cross-floor: Only check rules for consecutive levels (adjacent floors)
            const floorDiff = Math.abs(newWall.floorId - existingWall.floorId);

            if (onDifferentFloor && floorDiff <= 1) {
                if (dist < 10 && sameOrientation && sameThickness) {
                    continue; // Same gridline, same orientation/thickness - always valid
                }

                if (hasOverlap && bodiesOverlap) {
                    if (!sameOrientation || !sameThickness) {
                        return {
                            restricted: true,
                            wall: existingWall,
                            zone: { distance: 600, reason: 'Cross-floor overlap requires matching thickness and orientation' }
                        };
                    }
                    if (dist < 10) {
                        continue; // Directly overlapping - valid placement
                    }
                }
            }

            // Non-aligned parallel walls on same floor OR adjacent floors need minimum distance (Rule 3)
            if (floorDiff <= 1) {
                let minDist;
                if (newWall.oppositeOrientation(existingWall)) {
                    const newWallMidX = (newWall.pointA.x + newWall.pointB.x) / 2;
                    const newWallMidY = (newWall.pointA.y + newWall.pointB.y) / 2;
                    const existingWallMidX = (existingWall.pointA.x + existingWall.pointB.x) / 2;
                    const existingWallMidY = (existingWall.pointA.y + existingWall.pointB.y) / 2;

                    const toNewWall = {
                        x: newWallMidX - existingWallMidX,
                        y: newWallMidY - existingWallMidY
                    };

                    const existingToNew = toNewWall.x * existingWall.n.x + toNewWall.y * existingWall.n.y;

                    if (existingToNew > 0) {
                        minDist = MIN_DISTANCE_OPPOSITE;
                    } else {
                        minDist = MIN_DISTANCE_PARALLEL;
                    }
                } else {
                    minDist = MIN_DISTANCE_PARALLEL;
                }

                // Add 2mm tolerance to avoid floating-point precision issues
                if (dist < minDist - 2) {
                    return {
                        restricted: true,
                        wall: existingWall,
                        zone: { distance: minDist }
                    };
                }
            }
        }
    }
    return { restricted: false };
}

export function validateWall(wall, wallIndex) {
    const violations = [];

    // Check length
    if (wall.length < MIN_WALL_LENGTH) {
        violations.push({
            type: 'error',
            message: `Wall is too short (${Math.round(wall.length / 10)}cm). Minimum: ${MIN_WALL_LENGTH / 10}cm`
        });
    }

    // Check against other walls
    state.walls.forEach((otherWall, otherIndex) => {
        if (wallIndex === otherIndex) return;

        // Skip validation between segments of the same wall (auto-split)
        if (wall.groupId && wall.groupId === otherWall.groupId) return;

        // Slab-based restrictions: only affects orphan vs envelope interactions
        let slabContext = "";
        if (state.slabRestrictionsEnabled) {
            const wallSlabs = getWallSlabSystem(wall);
            const otherWallSlabs = getWallSlabSystem(otherWall);

            // Also check predictions for cross-floor envelopes
            const wallPredicted = getPredictedSlabSystemForPreviewWall(wall);
            const otherWallPredicted = getPredictedSlabSystemForPreviewWall(otherWall);

            const wallIsInEnvelope = wallSlabs.length > 0 || wallPredicted !== null;
            const otherIsInEnvelope = otherWallSlabs.length > 0 || otherWallPredicted !== null;

            // ONLY skip if one is orphan and the other is in an envelope
            if (wallIsInEnvelope && !otherIsInEnvelope) {
                return; // Wall in envelope, other is orphan - skip
            } else if (!wallIsInEnvelope && otherIsInEnvelope) {
                return; // Wall is orphan, other in envelope - skip
            }

            // For walls in same system, add context
            if (wallIsInEnvelope && otherIsInEnvelope) {
                const systemCheck = areWallsInSameSlabSystem(wall, otherWall, true);
                if (systemCheck.inSameSystem) {
                    slabContext = " (" + systemCheck.reason + ")";
                }
            }
        }

        // Determine if walls are on same level or adjacent levels
        const onSameFloor = wall.floorId === otherWall.floorId;
        const onAdjacentFloors = Math.abs(wall.floorId - otherWall.floorId) === 1;

        // SAME LEVEL RULES (Rule 1 & 3)
        if (onSameFloor) {
            // Check if walls are parallel
            if (wall.isParallelTo(otherWall)) {
                const dist = wall.distanceToWall(otherWall);

                if (dist < 10) { // Aligned (on same line)
                    // Rule 1: Aligned walls cannot overlap and must share orientation and thickness
                    if (wall.overlapsInProjection(otherWall)) {
                        violations.push({
                            type: 'error',
                            message: `Aligned walls overlap${slabContext}`,
                            conflictingWallIndex: otherIndex
                        });
                    }

                    if (!wall.sameOrientation(otherWall)) {
                        violations.push({
                            type: 'error',
                            message: `Aligned walls must share orientation${slabContext}`,
                            conflictingWallIndex: otherIndex
                        });
                    }

                    if (wall.thickness !== otherWall.thickness) {
                        violations.push({
                            type: 'error',
                            message: `Aligned walls must share thickness${slabContext}`,
                            conflictingWallIndex: otherIndex
                        });
                    }
                } else {
                    // Rule 3a: Parallel walls minimum distance
                    let minDist;
                    if (wall.oppositeOrientation(otherWall)) {
                        const wall1Mid = {
                            x: (wall.pointA.x + wall.pointB.x) / 2,
                            y: (wall.pointA.y + wall.pointB.y) / 2
                        };
                        const wall2Mid = {
                            x: (otherWall.pointA.x + otherWall.pointB.x) / 2,
                            y: (otherWall.pointA.y + otherWall.pointB.y) / 2
                        };

                        const toOther = {
                            x: wall2Mid.x - wall1Mid.x,
                            y: wall2Mid.y - wall1Mid.y
                        };

                        const dot1 = wall.n.x * toOther.x + wall.n.y * toOther.y;

                        if (dot1 > 0) {
                            minDist = MIN_DISTANCE_OPPOSITE; // 1200mm
                        } else {
                            minDist = MIN_DISTANCE_PARALLEL; // 600mm
                        }
                    } else {
                        minDist = MIN_DISTANCE_PARALLEL;
                    }

                    // Add 2mm tolerance to avoid floating-point precision issues
                    if (dist < minDist - 2) {
                        violations.push({
                            type: 'error',
                            message: `Too close (${Math.round(dist / 10)}cm). Minimum: ${minDist / 10}cm${slabContext}`,
                            conflictingWallIndex: otherIndex
                        });
                    }
                }
            }
        }

        // DIFFERENT LEVEL RULES (Rule 2 & Rule 3 across levels)
        else if (onAdjacentFloors) {
            if (wall.isParallelTo(otherWall)) {
                const dist = wall.distanceToWall(otherWall);

                if (dist < 10) {
                    if (wall.overlapsInProjection(otherWall)) {
                        if (!wall.sameOrientation(otherWall)) {
                            violations.push({
                                type: 'error',
                                message: `Overlapping wall on different floor must share orientation${slabContext}`,
                                conflictingWallIndex: otherIndex
                            });
                        }

                        if (wall.thickness !== otherWall.thickness) {
                            violations.push({
                                type: 'error',
                                message: `Overlapping wall on different floor must share thickness${slabContext}`,
                                conflictingWallIndex: otherIndex
                            });
                        }
                    }
                } else {
                    let minDist;
                    if (wall.oppositeOrientation(otherWall)) {
                        const wall1Mid = {
                            x: (wall.pointA.x + wall.pointB.x) / 2,
                            y: (wall.pointA.y + wall.pointB.y) / 2
                        };
                        const wall2Mid = {
                            x: (otherWall.pointA.x + otherWall.pointB.x) / 2,
                            y: (otherWall.pointA.y + otherWall.pointB.y) / 2
                        };

                        const toOther = {
                            x: wall2Mid.x - wall1Mid.x,
                            y: wall2Mid.y - wall1Mid.y
                        };

                        const dot1 = wall.n.x * toOther.x + wall.n.y * toOther.y;

                        if (dot1 > 0) {
                            minDist = MIN_DISTANCE_OPPOSITE;
                        } else {
                            minDist = MIN_DISTANCE_PARALLEL;
                        }
                    } else {
                        minDist = MIN_DISTANCE_PARALLEL;
                    }

                    if (dist < minDist - 2) {
                        violations.push({
                            type: 'error',
                            message: `Too close to wall on adjacent floor (${Math.round(dist / 10)}cm). Minimum: ${minDist / 10}cm${slabContext}`,
                            conflictingWallIndex: otherIndex
                        });
                    }
                }
            }
        }
    });

    return violations;
}

export function isWallInEnvelope(wall) {
    const wallIdx = state.walls.indexOf(wall);
    return state.buildingEnvelopes.some(env =>
        env.wallIndices && env.wallIndices.includes(wallIdx)
    );
}

export function validateVoidWallProximity(v) {
    const violations = [];
    const floorWalls = state.walls.filter(w => w.floorId === v.floorId);
    floorWalls.forEach(wall => {
        const inEnvelope = isWallInEnvelope(wall);
        const wallMinX = Math.min(wall.pointA.x, wall.pointB.x);
        const wallMaxX = Math.max(wall.pointA.x, wall.pointB.x);
        const wallMinY = Math.min(wall.pointA.y, wall.pointB.y);
        const wallMaxY = Math.max(wall.pointA.y, wall.pointB.y);
        const isHorizontal = Math.abs(wall.d.x) > Math.abs(wall.d.y);
        let overlapAlongAxis = false;
        if (isHorizontal) {
            overlapAlongAxis = v.x < wallMaxX && v.x + v.width > wallMinX;
        } else {
            overlapAlongAxis = v.y < wallMaxY && v.y + v.height > wallMinY;
        }
        if (!overlapAlongAxis) return;
        const adjacencyTolerance = 10;
        let touchesInternalFace = false;
        let touchesExternalFace = false;
        if (isHorizontal) {
            const internalY = wall.pointA.y;
            const externalY = wall.pointA.y + wall.n.y * wall.thickness;
            const voidTop = v.y;
            const voidBottom = v.y + v.height;
            touchesInternalFace =
                Math.abs(voidBottom - internalY) < adjacencyTolerance ||
                Math.abs(voidTop - internalY) < adjacencyTolerance ||
                (voidTop < internalY && voidBottom > internalY);
            touchesExternalFace =
                Math.abs(voidBottom - externalY) < adjacencyTolerance ||
                Math.abs(voidTop - externalY) < adjacencyTolerance ||
                (voidTop < externalY && voidBottom > externalY);
        } else {
            const internalX = wall.pointA.x;
            const externalX = wall.pointA.x + wall.n.x * wall.thickness;
            const voidLeft = v.x;
            const voidRight = v.x + v.width;
            touchesInternalFace =
                Math.abs(voidRight - internalX) < adjacencyTolerance ||
                Math.abs(voidLeft - internalX) < adjacencyTolerance ||
                (voidLeft < internalX && voidRight > internalX);
            touchesExternalFace =
                Math.abs(voidRight - externalX) < adjacencyTolerance ||
                Math.abs(voidLeft - externalX) < adjacencyTolerance ||
                (voidLeft < externalX && voidRight > externalX);
        }
        if (!touchesInternalFace && !touchesExternalFace) return;
        if (inEnvelope) {
            if (touchesExternalFace) {
                violations.push({
                    type: 'error',
                    message: 'Void must be on the column face of external walls',
                    wallIndex: state.walls.indexOf(wall)
                });
            }
        } else {
            if (touchesInternalFace) {
                violations.push({
                    type: 'error',
                    message: 'Void must be on the non-column face of internal walls',
                    wallIndex: state.walls.indexOf(wall)
                });
            }
        }
    });
    return violations;
}

export function validateEnvelopeAngles() {
    const violations = [];
    state.buildingEnvelopes.forEach(envelope => {
        const polygon = envelope.polygon;
        if (!polygon || polygon.length < 3) return;
        for (let i = 0; i < polygon.length; i++) {
            const prev = polygon[(i - 1 + polygon.length) % polygon.length];
            const curr = polygon[i];
            const next = polygon[(i + 1) % polygon.length];
            const v1x = curr.x - prev.x;
            const v1y = curr.y - prev.y;
            const v2x = next.x - curr.x;
            const v2y = next.y - curr.y;
            const cross = v1x * v2y - v1y * v2x;
            const dot = v1x * v2x + v1y * v2y;
            let angle = Math.atan2(cross, dot) * (180 / Math.PI);
            if (angle < 0) angle += 360;
            const is90 = Math.abs(angle - 90) < 1;
            const is270 = Math.abs(angle - 270) < 1;
            if (!is90 && !is270) {
                violations.push({
                    point: curr,
                    angle: angle,
                    floorId: envelope.floorId,
                    message: `Envelope connection must be 90 or 270 degrees (found ${Math.round(angle)}°)`
                });
            }
        }
    });
    return violations;
}

export function validateAllWalls() {
    const allViolations = [];

    state.walls.forEach((wall, idx) => {
        const violations = validateWall(wall, idx);
        if (violations.length > 0) {
            allViolations.push({
                wallIndex: idx,
                violations: violations
            });
        }
    });

    state.envelopeAngleViolations = validateEnvelopeAngles();
    state.envelopeAngleViolations.forEach(v => {
        allViolations.push({
            wallIndex: -1,
            violations: [{ type: 'error', message: v.message }],
            point: v.point
        });
    });

    // Validate void-wall proximity (Rule 7)
    state.voids.forEach((v, idx) => {
        const voidViolations = validateVoidWallProximity(v);
        if (voidViolations.length > 0) {
            allViolations.push({
                voidIndex: idx,
                violations: voidViolations
            });
        }
    });

    return allViolations;
}

// ============================================================
// Wall corner extension computation (rendering-only)
// ============================================================
export function computeWallExtensions() {
    const extensions = new Map();
    const TOL = 5; // mm connection tolerance

    state.walls.forEach((wall, idx) => {
        const isHoriz = Math.abs(wall.d.x) > Math.abs(wall.d.y);
        if (!isHoriz) return; // Only horizontal walls extend

        const ext = { extA: null, extB: null, colA: null, colB: null };

        for (const ep of ['A', 'B']) {
            const pt = ep === 'A' ? wall.pointA : wall.pointB;
            const bodyPt = ep === 'A' ? wall.pointB : wall.pointA;
            const towardBodyX = Math.sign(bodyPt.x - pt.x);

            for (let oi = 0; oi < state.walls.length; oi++) {
                if (oi === idx) continue;
                const other = state.walls[oi];
                if (wall.floorId !== other.floorId) continue;
                if (!wall.isPerpendicularTo(other)) continue;

                const dA = Math.hypot(pt.x - other.pointA.x, pt.y - other.pointA.y);
                const dB = Math.hypot(pt.x - other.pointB.x, pt.y - other.pointB.y);
                if (dA >= TOL && dB >= TOL) continue;

                // Connected to vertical wall.
                const vIntX = other.pointA.x;
                const vExtX = other.pointA.x + other.n.x * other.thickness;
                const connectPt = dA < TOL ? other.pointA : other.pointB;

                // The face FURTHEST from H's body (for convex extension)
                const farFace = Math.abs(vIntX - bodyPt.x) > Math.abs(vExtX - bodyPt.x) ? vIntX : vExtX;
                // The face CLOSEST to H's body (for concave shortening)
                const nearFace = Math.abs(vIntX - bodyPt.x) <= Math.abs(vExtX - bodyPt.x) ? vIntX : vExtX;

                // Convex: farFace is on the opposite side of connectPt from body
                // Concave: farFace is on the same side as body (can't extend outward)
                const isConvex = Math.sign(farFace - pt.x) !== towardBodyX && Math.abs(farFace - pt.x) > 1;

                let targetX, extPt, col;

                if (isConvex) {
                    // Extend outward to far face
                    targetX = farFace;
                    extPt = { x: targetX, y: pt.y };
                    // Column: outward from connectPt
                    col = {
                        x: connectPt.x - towardBodyX * COLUMN_SIZE / 2 + wall.n.x * COLUMN_SIZE / 2,
                        y: connectPt.y + wall.n.y * COLUMN_SIZE / 2
                    };
                } else {
                    // Concave: V will be shortened, H should NOT shorten — skip.
                    // H's concave extension is handled by simply not modifying H at this endpoint.
                    // The V shortening creates the gap; H stays at its original position.
                    break;
                }


                if (ep === 'A') { ext.extA = extPt; ext.colA = col; }
                else { ext.extB = extPt; ext.colB = col; }
                break;
            }
        }

        if (ext.extA || ext.extB) extensions.set(idx, ext);
    });

    // Second pass: vertical walls at concave corners get shortened
    state.walls.forEach((wall, idx) => {
        const isVert = Math.abs(wall.d.y) > Math.abs(wall.d.x);
        if (!isVert) return;

        const ext = extensions.get(idx) || { extA: null, extB: null, colA: null, colB: null };

        for (const ep of ['A', 'B']) {
            const pt = ep === 'A' ? wall.pointA : wall.pointB;
            const bodyPt = ep === 'A' ? wall.pointB : wall.pointA;
            const towardBodyY = Math.sign(bodyPt.y - pt.y);

            for (let oi = 0; oi < state.walls.length; oi++) {
                if (oi === idx) continue;
                const other = state.walls[oi];
                if (wall.floorId !== other.floorId) continue;
                if (!wall.isPerpendicularTo(other)) continue;

                const dA = Math.hypot(pt.x - other.pointA.x, pt.y - other.pointA.y);
                const dB = Math.hypot(pt.x - other.pointB.x, pt.y - other.pointB.y);
                if (dA >= TOL && dB >= TOL) continue;

                // Connected to horizontal wall.
                const hIntY = other.pointA.y;
                const hExtY = other.pointA.y + other.n.y * other.thickness;
                const connectPt = dA < TOL ? other.pointA : other.pointB;

                // Near face = H face closest to V's body (for concave shortening)
                const nearFace = Math.abs(hIntY - bodyPt.y) <= Math.abs(hExtY - bodyPt.y) ? hIntY : hExtY;

                // Only handle concave: nearFace is TOWARD V's body
                const isConcave = Math.sign(nearFace - pt.y) === towardBodyY && Math.abs(nearFace - pt.y) > 1;
                if (!isConcave) break;

                const targetY = nearFace;
                const extPt = { x: pt.x, y: targetY };

                // Column: at shortened end, offset toward body, plus normal into wall thickness
                const col = {
                    x: connectPt.x + wall.n.x * COLUMN_SIZE / 2,
                    y: targetY + towardBodyY * COLUMN_SIZE / 2
                };

                if (ep === 'A') { ext.extA = extPt; ext.colA = col; }
                else { ext.extB = extPt; ext.colB = col; }
                break;
            }
        }

        if (ext.extA || ext.extB) extensions.set(idx, ext);
    });

    return extensions;
}
