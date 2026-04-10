// sim.js — Data model, state, business logic, and validation for the Symmetry Line Simulator

// ============================================================
// Constants
// ============================================================
export const GRID_SIZE_EXTERNAL = 300; // mm - 300mm grid external
export const GRID_SIZE_INTERNAL = 100; // mm - 100mm internal
export const COLUMN_SIZE = 100; // mm - 10x10cm steel column
export const MIN_WALL_LENGTH = 400; // mm - structural minimum
export const MIN_WALL_LENGTH_NON_STRUCTURAL = 200; // mm - non-structural minimum
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
    returningWallOverrides: new Map(),
    showRestrictionLines: true, // Map<Wall, { originalPointA, originalPointB, originalThickness, wasFlipped }>
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

// Check if a coordinate is on a restricted grid line along a given axis.
// axis: 'x' checks vertical walls' restriction zones (for horizontal wall endpoints),
//        'y' checks horizontal walls' restriction zones (for vertical wall endpoints).
function isEndpointRestricted(coord, axis, floorId, forInternalWall = false, parallelCoord = null, skipEnvelopeZone = false) {
    // Non-structural walls have no endpoint restrictions
    if (forInternalWall) return false;

    for (const wall of state.walls) {
        // Non-structural walls don't create restriction zones
        if (isInternalWall(wall)) continue;

        const floorDiff = Math.abs(wall.floorId - floorId);
        if (floorDiff > 1) continue;

        const isHorizontal = Math.abs(wall.d.x) > Math.abs(wall.d.y);

        // For a horizontal drawing wall, the endpoint moves along X,
        // so we check vertical existing walls (whose restriction is on the X axis)
        if (axis === 'x' && isHorizontal) continue;  // horizontal walls restrict Y, not X
        if (axis === 'y' && !isHorizontal) continue;  // vertical walls restrict X, not Y

        const internalFace = isHorizontal ? wall.pointA.y : wall.pointA.x;
        const dist = Math.abs(coord - internalFace);

        if (dist < 10) continue; // on the wall's own line — OK

        // Envelope walls use 1200mm on their external face side, within projection
        let minDist = MIN_DISTANCE_PARALLEL;
        if (!skipEnvelopeZone && isWallInEnvelope(wall) && !envelopeWallHasExtension(wall)) {
            const normalDir = isHorizontal ? wall.n.y : wall.n.x;
            const isOnNormalSide = (coord - internalFace) * normalDir > 0;
            // Check projection: for axis='x', coord is the endpoint X and parallelCoord would be Y (perpendicular)
            // But here we need the point along the wall axis to check projection
            const pointForProjection = isHorizontal
                ? { x: (axis === 'x' ? coord : parallelCoord), y: (axis === 'y' ? coord : parallelCoord) }
                : { x: (axis === 'x' ? coord : parallelCoord), y: (axis === 'y' ? coord : parallelCoord) };
            if (isOnNormalSide && overlapsWallProjection(pointForProjection, wall)) {
                minDist = MIN_DISTANCE_OPPOSITE;
            }
        }
        if (dist >= minDist) continue; // outside zone — OK

        return true; // inside restriction zone
    }
    return false;
}

// Snap a wall length to the nearest lower multiple of the length grid,
// skipping endpoint positions that land on restricted grid lines.
// lengthGrid defaults to WALL_LENGTH_GRID (300mm) for external walls;
// pass GRID_SIZE_INTERNAL (100mm) for internal walls.
export function snapLengthToGrid(startPoint, endPoint, floorId, lengthGrid = WALL_LENGTH_GRID, skipEnvelopeZone = false) {
    const forInternalWall = lengthGrid === GRID_SIZE_INTERNAL;
    const minLen = forInternalWall ? MIN_WALL_LENGTH_NON_STRUCTURAL : MIN_WALL_LENGTH;
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;

    if (Math.abs(dx) > Math.abs(dy)) {
        const rawLength = Math.abs(dx);
        let snappedLength = Math.floor(rawLength / lengthGrid) * lengthGrid;
        const direction = dx > 0 ? 1 : -1;

        // Shrink until endpoint is not on a restricted grid line (structural walls only)
        if (floorId !== undefined && !forInternalWall) {
            while (snappedLength >= minLen) {
                const endX = startPoint.x + direction * snappedLength;
                if (!isEndpointRestricted(endX, 'x', floorId, forInternalWall, startPoint.y, skipEnvelopeZone)) break;
                snappedLength -= lengthGrid;
            }
        }

        if (snappedLength < minLen) return { x: startPoint.x, y: startPoint.y };
        return { x: startPoint.x + direction * snappedLength, y: startPoint.y };
    } else {
        const rawLength = Math.abs(dy);
        let snappedLength = Math.floor(rawLength / lengthGrid) * lengthGrid;
        const direction = dy > 0 ? 1 : -1;

        // Shrink until endpoint is not on a restricted grid line (structural walls only)
        if (floorId !== undefined && !forInternalWall) {
            while (snappedLength >= minLen) {
                const endY = startPoint.y + direction * snappedLength;
                if (!isEndpointRestricted(endY, 'y', floorId, forInternalWall, startPoint.x, skipEnvelopeZone)) break;
                snappedLength -= lengthGrid;
            }
        }

        if (snappedLength < minLen) return { x: startPoint.x, y: startPoint.y };
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
    // Revert returning wall overrides BEFORE detection so envelope detection
    // sees clean (unmodified) wall geometry on the original grid lines.
    revertReturningWallOverrides();

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

    // Apply returning wall rule after fresh envelope detection
    applyReturningWallOverrides();

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

// ============================================================
// Internal Wall Detection
// ============================================================

// Returns the first envelope whose polygon contains the given point on the given floor,
// or null if the point is not inside any envelope.
export function getEnvelopeContainingPoint(x, y, floorId) {
    for (const envelope of state.buildingEnvelopes) {
        if (envelope.floorId !== floorId) continue;
        if (pointInPolygon({ x, y }, envelope.polygon)) {
            return envelope;
        }
    }
    return null;
}

// Check if a point is inside or on the boundary of a polygon.
function pointInsideOrOnPolygon(point, polygon) {
    if (pointInPolygon(point, polygon)) return true;
    // Also check if point is on any edge of the polygon (within tolerance)
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (pointNearLineSegment(point, a, b, 5)) return true;
    }
    return false;
}

// Derived state: a wall is "internal" if both endpoints are inside (or on the
// boundary of) an envelope polygon, but the wall is NOT part of that envelope's
// boundary (wallIndices).
export function isInternalWall(wall) {
    const wallIdx = state.walls.indexOf(wall);
    for (const envelope of state.buildingEnvelopes) {
        if (envelope.floorId !== wall.floorId) continue;
        // Check if wall is on the envelope boundary — if so, it's external
        if (envelope.wallIndices && envelope.wallIndices.includes(wallIdx)) continue;
        // Check if both endpoints are inside or on the boundary of this envelope
        const aInside = pointInsideOrOnPolygon(wall.pointA, envelope.polygon);
        const bInside = pointInsideOrOnPolygon(wall.pointB, envelope.polygon);
        if (aInside && bInside) return true;
    }
    return false;
}

// ============================================================
// Returning Wall Rule
// ============================================================

// Flip a wall around its center axis (stays in same position, columns swap sides).
// Swaps pointA/B to reverse orientation, then shifts both points so the wall
// center line remains in the same position.
export function flipWallAroundCenter(wall) {
    const oldNx = wall.n.x;
    const oldNy = wall.n.y;
    const t = wall.thickness;

    // Swap pointA and pointB (reverses direction and normal)
    const tmp = wall.pointA;
    wall.pointA = wall.pointB;
    wall.pointB = tmp;

    // Shift both points by oldNormal * thickness to keep center in place
    // Before: internal at P, external at P + n*t, center at P + n*t/2
    // After swap without shift: internal still at P, but normal now points opposite
    // Shift by old n*t: internal → P + n*t (old external), external → P (old internal)
    // Center stays at P + n*t/2
    wall.pointA.x += oldNx * t;
    wall.pointA.y += oldNy * t;
    wall.pointB.x += oldNx * t;
    wall.pointB.y += oldNy * t;

    wall.updateVectors();
}

// Detect returning wall pairs within a single envelope.
// Returns array of { wallA, wallB, returningWall } where returningWall is the
// one whose internal face points away from the envelope interior.
export function detectReturningWallPairs(envelope) {
    const pairs = [];
    const walls = envelope.wallIndices.map(idx => state.walls[idx]).filter(Boolean);

    // Group walls by lane (same grid line for internal face)
    const lanes = new Map(); // key → [wall, ...]
    walls.forEach(wall => {
        const isHorizontal = Math.abs(wall.d.x) > Math.abs(wall.d.y);
        const gridPos = isHorizontal ? Math.round(wall.pointA.y) : Math.round(wall.pointA.x);
        const key = (isHorizontal ? 'H:' : 'V:') + gridPos;

        if (!lanes.has(key)) lanes.set(key, []);
        lanes.get(key).push(wall);
    });

    // Check each lane — find walls whose external face points inward (returning walls)
    for (const [, laneWalls] of lanes) {
        if (laneWalls.length < 2) continue;

        // For each wall in the lane, test if its external face points into the polygon.
        // If so, it's a returning wall. We need at least one non-returning wall to pair with.
        const returning = [];
        const correct = [];

        for (const wall of laneWalls) {
            const mid = {
                x: (wall.pointA.x + wall.pointB.x) / 2,
                y: (wall.pointA.y + wall.pointB.y) / 2
            };
            const testPt = {
                x: mid.x + wall.n.x * 1, // 1mm offset along normal (toward external face)
                y: mid.y + wall.n.y * 1
            };
            if (pointInPolygon(testPt, envelope.polygon)) {
                returning.push(wall);
            } else {
                correct.push(wall);
            }
        }

        // Pair each returning wall with the first correct wall for the override
        if (returning.length > 0 && correct.length > 0) {
            for (const retWall of returning) {
                // Only pair walls that share the same orientation
                const partner = correct.find(w => w.sameOrientation(retWall));
                if (partner) {
                    pairs.push({ wallA: partner, wallB: retWall, returningWall: retWall });
                }
            }
        }
    }

    return pairs;
}

// Revert all returning wall overrides, restoring original geometry.
export function revertReturningWallOverrides() {
    for (const [wall, override] of state.returningWallOverrides) {
        wall.pointA = { ...override.originalPointA };
        wall.pointB = { ...override.originalPointB };
        wall.thickness = override.originalThickness;
        wall.updateVectors();
    }
    state.returningWallOverrides.clear();
}

// Apply the returning wall override to a pair of walls.
function applyReturningPairOverride(otherWall, returningWall) {
    if (!state.returningWallOverrides.has(otherWall)) {
        state.returningWallOverrides.set(otherWall, {
            originalPointA: { ...otherWall.pointA },
            originalPointB: { ...otherWall.pointB },
            originalThickness: otherWall.thickness,
            wasFlipped: false
        });
    }

    if (!state.returningWallOverrides.has(returningWall)) {
        state.returningWallOverrides.set(returningWall, {
            originalPointA: { ...returningWall.pointA },
            originalPointB: { ...returningWall.pointB },
            originalThickness: returningWall.thickness,
            wasFlipped: true
        });
    }

    otherWall.thickness = Math.max(300, otherWall.thickness);
    otherWall.updateVectors();

    returningWall.thickness = Math.max(300, returningWall.thickness);
    flipWallAroundCenter(returningWall);

    // Propagate 30cm thickness to all aligned walls on the same grid line,
    // so we don't create "Aligned walls must share thickness" violations.
    [otherWall, returningWall].forEach(w => {
        const aligned = findAllAlignedWalls(w);
        aligned.forEach(({ wall: alignedWall }) => {
            if (alignedWall !== w && alignedWall.thickness < 300) {
                if (!state.returningWallOverrides.has(alignedWall)) {
                    state.returningWallOverrides.set(alignedWall, {
                        originalPointA: { ...alignedWall.pointA },
                        originalPointB: { ...alignedWall.pointB },
                        originalThickness: alignedWall.thickness,
                        wasFlipped: false
                    });
                }
                alignedWall.thickness = 300;
                alignedWall.updateVectors();
            }
        });
    });
}

// Check if two walls are transitively connected via shared endpoints.
// Uses BFS on the wall endpoint graph. Only considers walls on the same floor.
function areWallsConnected(wallA, wallB) {
    if (wallA === wallB) return true;
    const TOLERANCE = 5; // mm
    const floorId = wallA.floorId;
    if (wallB.floorId !== floorId) return false;

    const floorWalls = state.walls.filter(w => w.floorId === floorId);
    const idxA = floorWalls.indexOf(wallA);
    const idxB = floorWalls.indexOf(wallB);
    if (idxA < 0 || idxB < 0) return false;

    // Build adjacency: two walls are adjacent if they share an endpoint
    const adj = floorWalls.map(() => []);
    for (let i = 0; i < floorWalls.length; i++) {
        for (let j = i + 1; j < floorWalls.length; j++) {
            const wi = floorWalls[i], wj = floorWalls[j];
            const pts = [
                [wi.pointA, wj.pointA], [wi.pointA, wj.pointB],
                [wi.pointB, wj.pointA], [wi.pointB, wj.pointB]
            ];
            const connected = pts.some(([p1, p2]) =>
                Math.abs(p1.x - p2.x) < TOLERANCE && Math.abs(p1.y - p2.y) < TOLERANCE
            );
            if (connected) {
                adj[i].push(j);
                adj[j].push(i);
            }
        }
    }

    // BFS from wallA to wallB
    const visited = new Set([idxA]);
    const queue = [idxA];
    while (queue.length > 0) {
        const cur = queue.shift();
        if (cur === idxB) return true;
        for (const next of adj[cur]) {
            if (!visited.has(next)) {
                visited.add(next);
                queue.push(next);
            }
        }
    }
    return false;
}

// Detect returning wall pairs that aren't in an envelope yet (lane-based).
// Only applies to walls that are connected via shared endpoints.
// The later wall (higher index) is treated as the returning wall.
function detectLaneBasedReturningPairs() {
    const pairs = [];
    const processed = new Set();

    for (let i = 0; i < state.walls.length; i++) {
        if (processed.has(i)) continue;
        const w1 = state.walls[i];
        // Returning wall rule only applies to walls on the 300mm external grid.
        // Walls on non-300mm positions are true internal walls drawn on the 100mm grid.
        if (!isOnExternalGrid(w1)) continue;
        const isH1 = Math.abs(w1.d.x) > Math.abs(w1.d.y);
        const gridPos1 = isH1 ? Math.round(w1.pointA.y) : Math.round(w1.pointA.x);

        for (let j = i + 1; j < state.walls.length; j++) {
            if (processed.has(j)) continue;
            const w2 = state.walls[j];
            if (!isOnExternalGrid(w2)) continue;
            if (w2.floorId !== w1.floorId) continue;
            if (!w1.isParallelTo(w2)) continue;

            const isH2 = Math.abs(w2.d.x) > Math.abs(w2.d.y);
            if (isH1 !== isH2) continue;

            const gridPos2 = isH2 ? Math.round(w2.pointA.y) : Math.round(w2.pointA.x);
            if (gridPos1 !== gridPos2) continue;
            if (!w1.sameOrientation(w2)) continue;

            // Must be connected via shared endpoints (not independent)
            if (!areWallsConnected(w1, w2)) continue;

            // Same lane, same orientation, connected. Later wall is the returning wall.
            pairs.push({ otherWall: w1, returningWall: w2 });
            processed.add(i);
            processed.add(j);
        }
    }
    return pairs;
}

// Detect and apply returning wall overrides.
// Only uses envelope-based detection (polygon winding) which reliably determines
// which wall faces outward. Lane-based detection was removed because without a
// closed envelope polygon, we cannot distinguish true returning pairs from
// step/L-junction configurations.
export function applyReturningWallOverrides() {
    for (const envelope of state.buildingEnvelopes) {
        const pairs = detectReturningWallPairs(envelope);

        for (const { wallA, wallB, returningWall } of pairs) {
            const otherWall = wallA === returningWall ? wallB : wallA;
            applyReturningPairOverride(otherWall, returningWall);
        }
    }
}

// Check if a wall's internal face is on the 300mm external grid.
// True internal walls (drawn on the 100mm grid) may have positions not divisible by 300.
export function isOnExternalGrid(wall) {
    const isH = Math.abs(wall.d.x) > Math.abs(wall.d.y);
    const facePos = isH ? Math.round(wall.pointA.y) : Math.round(wall.pointA.x);
    return Math.abs(facePos % GRID_SIZE_EXTERNAL) < 5;
}

// Check if a point is near any endpoint of a wall (pointA, pointB, or their external equivalents).
function isNearWallEndpoint(x, y, wall, tolerance = 10) {
    const ext = wall.getExternalFacePoints();
    const endpoints = [wall.pointA, wall.pointB, ext.a, ext.b];
    return endpoints.some(ep => Math.abs(x - ep.x) < tolerance && Math.abs(y - ep.y) < tolerance);
}

// Check if two walls are part of the same returning wall override pair.
// Used to exempt them from distance validation rules.
export function areReturningWallPair(wall1, wall2) {
    if (state.returningWallOverrides.size === 0) return false;
    return state.returningWallOverrides.has(wall1) && state.returningWallOverrides.has(wall2);
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

// Find an existing wall that a new wall can merge with:
// same floor, parallel, aligned (dist < 10), same thickness, overlapping or adjacent
// Orientation doesn't need to match — merged wall adopts existing wall's orientation
export function findMergeableWall(newWall) {
    for (let i = 0; i < state.walls.length; i++) {
        const existing = state.walls[i];
        // Only merge with walls on the same floor
        if (existing.floorId !== newWall.floorId) continue;
        if (!existing.isParallelTo(newWall)) continue;
        const dist = newWall.distanceToWall(existing);
        if (dist >= 10) continue;
        // No thickness check — different thickness walls on same line are mergeable

        // Check overlap or touching in projection along wall axis
        const isHorizontal = Math.abs(existing.d.x) > Math.abs(existing.d.y);
        let min1, max1, min2, max2;
        if (isHorizontal) {
            min1 = Math.min(newWall.pointA.x, newWall.pointB.x);
            max1 = Math.max(newWall.pointA.x, newWall.pointB.x);
            min2 = Math.min(existing.pointA.x, existing.pointB.x);
            max2 = Math.max(existing.pointA.x, existing.pointB.x);
        } else {
            min1 = Math.min(newWall.pointA.y, newWall.pointB.y);
            max1 = Math.max(newWall.pointA.y, newWall.pointB.y);
            min2 = Math.min(existing.pointA.y, existing.pointB.y);
            max2 = Math.max(existing.pointA.y, existing.pointB.y);
        }

        if (max1 >= min2 - 1 && max2 >= min1 - 1) {
            return { wall: existing, index: i };
        }
    }
    return null;
}

// Find ALL walls on the same grid line (any floor within 1, any thickness)
export function findAllAlignedWalls(newWall) {
    const results = [];
    for (let i = 0; i < state.walls.length; i++) {
        const existing = state.walls[i];
        const floorDiff = Math.abs(newWall.floorId - existing.floorId);
        if (floorDiff > 1) continue;
        if (!existing.isParallelTo(newWall)) continue;
        const dist = newWall.distanceToWall(existing);
        if (dist < 10) {
            results.push({ wall: existing, index: i });
        }
    }
    return results;
}

// Find an existing wall on the same grid line (regardless of overlap)
// Returns the existing wall so caller can match orientation
// Checks current floor and adjacent floors
export function findAlignedExistingWall(newWall) {
    for (const existing of state.walls) {
        const floorDiff = Math.abs(newWall.floorId - existing.floorId);
        if (floorDiff > 1) continue;
        if (!existing.isParallelTo(newWall)) continue;
        const dist = newWall.distanceToWall(existing);
        if (dist < 10) {
            return existing;
        }
    }
    return null;
}

// Compute the merged wall endpoints from two aligned walls
// Uses existingWall's orientation (A→B direction) for the result
export function computeMergedWall(newWall, existingWall) {
    const isHorizontal = Math.abs(existingWall.d.x) > Math.abs(existingWall.d.y);

    // Use the internal face coordinate from the existing wall
    const faceCoord = isHorizontal ? existingWall.pointA.y : existingWall.pointA.x;

    // Find the full extent along the wall axis
    let allCoords;
    if (isHorizontal) {
        allCoords = [newWall.pointA.x, newWall.pointB.x, existingWall.pointA.x, existingWall.pointB.x];
    } else {
        allCoords = [newWall.pointA.y, newWall.pointB.y, existingWall.pointA.y, existingWall.pointB.y];
    }
    const minCoord = Math.min(...allCoords);
    const maxCoord = Math.max(...allCoords);

    // Preserve A→B direction from existing wall's orientation
    // Project the existing wall's A and B onto the wall axis direction
    // Then assign min/max coords to maintain the same A→B ordering
    const dir = existingWall.dNorm;
    const aProj = isHorizontal ? existingWall.pointA.x : existingWall.pointA.y;
    const bProj = isHorizontal ? existingWall.pointB.x : existingWall.pointB.y;
    // If A has the smaller coordinate, A gets minCoord; otherwise A gets maxCoord
    const aGetsMin = aProj < bProj;

    let ax, ay, bx, by;
    if (isHorizontal) {
        ax = aGetsMin ? minCoord : maxCoord;
        ay = faceCoord;
        bx = aGetsMin ? maxCoord : minCoord;
        by = faceCoord;
    } else {
        ax = faceCoord;
        ay = aGetsMin ? minCoord : maxCoord;
        bx = faceCoord;
        by = aGetsMin ? maxCoord : minCoord;
    }

    return { ax, ay, bx, by };
}
// Check if a grid point falls inside any wall's parallel restriction zone
// Returns the restricting wall info if found, null otherwise
// forInternalWall: if true, include internal wall restriction zones; if false, skip them
export function findRestrictingWallAtPoint(x, y, floorId, forInternalWall = false) {
    // Non-structural walls are freely placed — no restriction zones apply
    if (forInternalWall) return null;

    for (const wall of state.walls) {
        // For returning wall overrides, only exempt the specific endpoints
        // (where new walls need to connect), not the entire restriction zone.
        if (state.returningWallOverrides.has(wall)) {
            const atEndpoint = isNearWallEndpoint(x, y, wall, 10);
            if (atEndpoint) continue;
        }

        // Non-structural walls don't create restriction zones
        if (isInternalWall(wall)) continue;

        const floorDiff = Math.abs(wall.floorId - floorId);
        if (floorDiff > 1) continue;

        const isHorizontal = Math.abs(wall.d.x) > Math.abs(wall.d.y);
        const internalFace = isHorizontal ? wall.pointA.y : wall.pointA.x;
        const coord = isHorizontal ? y : x;
        const dist = Math.abs(coord - internalFace);

        // On the internal face line itself is OK (aligned walls are valid)
        if (dist < 10) continue;

        // Envelope walls use 1200mm on their external face side, but only
        // within the envelope wall's projection AND when no extensions exist
        let minDist = MIN_DISTANCE_PARALLEL;
        if (isWallInEnvelope(wall) && !envelopeWallHasExtension(wall)) {
            const normalDir = isHorizontal ? wall.n.y : wall.n.x;
            const isOnNormalSide = (coord - internalFace) * normalDir > 0;
            if (isOnNormalSide && overlapsWallProjection({ x, y }, wall)) {
                minDist = MIN_DISTANCE_OPPOSITE;
            }
        }

        if (dist < minDist) {
            return { wall, isHorizontal, internalFace, minDist };
        }
    }
    return null;
}

// Nudge a grid point out of restriction zones to the nearest valid grid position.
// gridSize defaults to GRID_SIZE_EXTERNAL (300mm); pass GRID_SIZE_INTERNAL (100mm)
// for internal walls.
export function nudgeStartPointOutOfZones(x, y, floorId, gridSize = GRID_SIZE_EXTERNAL) {
    const forInternalWall = gridSize === GRID_SIZE_INTERNAL;
    // Loop to handle cascading restrictions (nudging away from one wall
    // might land in another wall's zone). Limit iterations to prevent infinite loops.
    let currentX = x, currentY = y;
    for (let i = 0; i < 5; i++) {
        const restriction = findRestrictingWallAtPoint(currentX, currentY, floorId, forInternalWall);
        if (!restriction) return { x: currentX, y: currentY };

        const { isHorizontal, internalFace, minDist } = restriction;

        if (isHorizontal) {
            const direction = currentY > internalFace ? 1 : -1;
            const targetY = internalFace + direction * minDist;
            currentY = direction > 0
                ? Math.ceil(targetY / gridSize) * gridSize
                : Math.floor(targetY / gridSize) * gridSize;
        } else {
            const direction = currentX > internalFace ? 1 : -1;
            const targetX = internalFace + direction * minDist;
            currentX = direction > 0
                ? Math.ceil(targetX / gridSize) * gridSize
                : Math.floor(targetX / gridSize) * gridSize;
        }
    }
    return { x: currentX, y: currentY };
}

// Check if a start point is completely blocked — no valid wall can be placed in any
// direction from this point. Tests a minimal wall in all 4 cardinal directions with
// both orientations. Returns true if ALL would be restricted.
// Check if a point overlaps with a wall's projection along the wall axis.
// For horizontal walls, checks X overlap. For vertical walls, checks Y overlap.
function overlapsWallProjection(pointOrWall, envWall) {
    const isH = Math.abs(envWall.d.x) > Math.abs(envWall.d.y);
    const envMin = isH
        ? Math.min(envWall.pointA.x, envWall.pointB.x)
        : Math.min(envWall.pointA.y, envWall.pointB.y);
    const envMax = isH
        ? Math.max(envWall.pointA.x, envWall.pointB.x)
        : Math.max(envWall.pointA.y, envWall.pointB.y);

    if (pointOrWall.pointA) {
        // It's a wall — check if any part overlaps
        const wallMin = isH
            ? Math.min(pointOrWall.pointA.x, pointOrWall.pointB.x)
            : Math.min(pointOrWall.pointA.y, pointOrWall.pointB.y);
        const wallMax = isH
            ? Math.max(pointOrWall.pointA.x, pointOrWall.pointB.x)
            : Math.max(pointOrWall.pointA.y, pointOrWall.pointB.y);
        return wallMax > envMin - 5 && wallMin < envMax + 5;
    } else {
        // It's a point {x, y}
        const coord = isH ? pointOrWall.x : pointOrWall.y;
        return coord >= envMin - 5 && coord <= envMax + 5;
    }
}

// Check if a wall should be flipped to face away from a nearby envelope wall.
// Returns true if the wall is on the external face side of an envelope wall
// and its normal points TOWARD the envelope (wrong — should face away).
// Only applies within the envelope wall's projection (length extent).
export function shouldFlipAwayFromEnvelope(wall) {
    // Skip if the wall starts on a perpendicular extension from an envelope
    if (isPointOnEnvelopeExtension(wall.pointA.x, wall.pointA.y, wall.floorId)) return false;
    if (isPointOnEnvelopeExtension(wall.pointB.x, wall.pointB.y, wall.floorId)) return false;

    for (const envWall of state.walls) {
        if (!isWallInEnvelope(envWall)) continue;
        if (envelopeWallHasExtension(envWall)) continue; // extension exists — no forced orientation
        if (Math.abs(envWall.floorId - wall.floorId) > 1) continue;
        if (!envWall.isParallelTo(wall)) continue;

        const isH = Math.abs(envWall.d.x) > Math.abs(envWall.d.y);
        const envFace = isH ? envWall.pointA.y : envWall.pointA.x;
        const wallFace = isH ? wall.pointA.y : wall.pointA.x;
        const dist = Math.abs(wallFace - envFace);

        if (dist < 10) continue; // on the same grid line — handled by alignment
        if (dist > MIN_DISTANCE_OPPOSITE + 10) continue; // too far

        // Only apply within the envelope wall's projection
        if (!overlapsWallProjection(wall, envWall)) continue;

        // Check if the new wall is on the external face side of the envelope wall
        const envNormalDir = isH ? envWall.n.y : envWall.n.x;
        const isOnExternalSide = (wallFace - envFace) * envNormalDir > 0;
        if (!isOnExternalSide) continue;

        // The new wall IS on the external side — its blue line (internal face) should
        // face AWAY from the envelope. Since the normal points toward the external face,
        // the normal should point TOWARD the envelope (opposite to envelope wall's normal).
        const wallNormalDir = isH ? wall.n.y : wall.n.x;
        if (wallNormalDir * envNormalDir > 0) {
            // Wall's normal points same way as envelope's — blue line faces toward envelope — needs to flip
            return true;
        }
    }
    return false;
}

// Check if a wall being drawn should be shifted away from an envelope wall.
// Returns { shiftX, shiftY } if the wall overlaps an envelope wall's projection
// and is within the 1200mm zone on its external side. Returns null otherwise.
export function getEnvelopeProximityShift(startX, startY, endX, endY, floorId) {
    // Skip if the start point is on a wall extending from an envelope (building extension)
    if (isPointOnEnvelopeExtension(startX, startY, floorId)) return null;

    const isH = Math.abs(endX - startX) > Math.abs(endY - startY);
    // The perpendicular coordinate of the wall being drawn
    const perpCoord = isH ? startY : startX;

    for (const envWall of state.walls) {
        if (!isWallInEnvelope(envWall)) continue;
        if (envelopeWallHasExtension(envWall)) continue; // extension exists — no shift
        if (Math.abs(envWall.floorId - floorId) > 1) continue;

        const envIsH = Math.abs(envWall.d.x) > Math.abs(envWall.d.y);
        // Only check walls perpendicular to the drawing wall's perpendicular axis
        // i.e., both horizontal or both vertical
        if (envIsH !== isH) continue;

        const envFace = envIsH ? envWall.pointA.y : envWall.pointA.x;
        const dist = Math.abs(perpCoord - envFace);

        if (dist < 10) continue; // aligned — handled elsewhere
        if (dist >= MIN_DISTANCE_OPPOSITE) continue; // already far enough

        // Check if on the external face side
        const envNormalDir = envIsH ? envWall.n.y : envWall.n.x;
        const isOnExternalSide = (perpCoord - envFace) * envNormalDir > 0;
        if (!isOnExternalSide) continue;

        // Check projection overlap: does the drawing wall overlap with the envelope wall's length?
        const tempWall = { pointA: { x: startX, y: startY }, pointB: { x: endX, y: endY } };
        if (!overlapsWallProjection(tempWall, envWall)) continue;

        // Wall is in the zone and overlaps projection — compute shift
        const targetDist = MIN_DISTANCE_OPPOSITE;
        const shiftAmount = (targetDist - dist) * (envNormalDir > 0 ? 1 : -1);

        if (isH) {
            // Shift Y for horizontal walls
            const snappedTarget = snapToGrid(perpCoord + shiftAmount, GRID_SIZE_EXTERNAL);
            return { shiftX: 0, shiftY: snappedTarget - perpCoord };
        } else {
            // Shift X for vertical walls
            const snappedTarget = snapToGrid(perpCoord + shiftAmount, GRID_SIZE_EXTERNAL);
            return { shiftX: snappedTarget - perpCoord, shiftY: 0 };
        }
    }
    return null;
}

// Check if a point is at the endpoint of a wall that extends perpendicular from an envelope.
// This indicates the user is extending the building, so envelope proximity rules don't apply.
export function isPointOnEnvelopeExtension(x, y, floorId) {
    const TOLERANCE = 10;
    for (const wall of state.walls) {
        if (Math.abs(wall.floorId - floorId) > 1) continue;

        // Check if the point is at either endpoint of this wall
        const atA = Math.abs(x - wall.pointA.x) < TOLERANCE && Math.abs(y - wall.pointA.y) < TOLERANCE;
        const atB = Math.abs(x - wall.pointB.x) < TOLERANCE && Math.abs(y - wall.pointB.y) < TOLERANCE;
        if (!atA && !atB) continue;

        // Check if the OTHER endpoint of this wall connects to an envelope wall
        const otherEnd = atA ? wall.pointB : wall.pointA;
        for (const envWall of state.walls) {
            if (!isWallInEnvelope(envWall)) continue;
            if (Math.abs(envWall.floorId - floorId) > 1) continue;
            if (!envWall.isPerpendicularTo(wall)) continue;

            // Check if the other endpoint is at an endpoint of the envelope wall
            const atEnvA = Math.abs(otherEnd.x - envWall.pointA.x) < TOLERANCE && Math.abs(otherEnd.y - envWall.pointA.y) < TOLERANCE;
            const atEnvB = Math.abs(otherEnd.x - envWall.pointB.x) < TOLERANCE && Math.abs(otherEnd.y - envWall.pointB.y) < TOLERANCE;
            if (atEnvA || atEnvB) return true;
        }
    }
    return false;
}

// Check if an envelope wall has any perpendicular walls extending from it
// (indicating the user is building an extension, so 1200mm rules don't apply).
export function envelopeWallHasExtension(envWall) {
    const TOLERANCE = 10;
    for (const wall of state.walls) {
        if (wall === envWall) continue;
        if (Math.abs(wall.floorId - envWall.floorId) > 1) continue;
        if (!wall.isPerpendicularTo(envWall)) continue;
        // Skip other envelope boundary walls — they're corners, not extensions
        if (isWallInEnvelope(wall)) continue;
        // Check if any endpoint of the perpendicular wall touches the envelope wall
        if (envWall.containsPoint(wall.pointA.x, wall.pointA.y, TOLERANCE)) return true;
        if (envWall.containsPoint(wall.pointB.x, wall.pointB.y, TOLERANCE)) return true;
        // Also check external face
        const ext = envWall.getExternalFacePoints();
        if (pointNearLineSegment(wall.pointA, ext.a, ext.b, TOLERANCE)) return true;
        if (pointNearLineSegment(wall.pointB, ext.a, ext.b, TOLERANCE)) return true;
    }
    return false;
}

// Check if a point is on or very near an envelope boundary wall
// (on the internal face, external face, or anywhere on the wall body).
export function isPointAtEnvelopeEndpoint(x, y, floorId) {
    const TOLERANCE = 15;
    for (const wall of state.walls) {
        if (!isWallInEnvelope(wall)) continue;
        if (Math.abs(wall.floorId - floorId) > 1) continue;
        // Check if point is on the wall body (within tolerance)
        if (wall.containsPoint(x, y, TOLERANCE)) return true;
        // Also check external face line
        const ext = wall.getExternalFacePoints();
        if (pointNearLineSegment({ x, y }, ext.a, ext.b, TOLERANCE)) return true;
    }
    return false;
}

export function isStartPointFullyBlocked(x, y, floorId, thickness = 200) {
    const testLength = MIN_WALL_LENGTH;
    const directions = [
        { dx: testLength, dy: 0 },   // right
        { dx: -testLength, dy: 0 },  // left
        { dx: 0, dy: testLength },   // down
        { dx: 0, dy: -testLength },  // up
    ];

    for (const { dx, dy } of directions) {
        // Normal orientation
        const wall1 = new Wall(x, y, x + dx, y + dy, thickness, 2700, null, floorId);
        if (!isWallInRestrictedZone(wall1).restricted) return false;
        // Flipped orientation
        const wall2 = new Wall(x + dx, y + dy, x, y, thickness, 2700, null, floorId);
        if (!isWallInRestrictedZone(wall2).restricted) return false;
    }
    return true; // all directions and orientations restricted
}

export function isWallInRestrictedZone(newWall) {
    // Non-structural walls are freely placed — no restriction zones apply
    const newWallIsInternal = getEnvelopeContainingPoint(
        (newWall.pointA.x + newWall.pointB.x) / 2,
        (newWall.pointA.y + newWall.pointB.y) / 2,
        newWall.floorId
    ) !== null && !isWallInEnvelope(newWall);
    if (newWallIsInternal) return { restricted: false };

    // Predictive slab system detection for preview walls
    // Use endpoint (cursor position) for more accurate prediction
    let predictedSlabSystem = null;
    if (state.slabRestrictionsEnabled) {
        predictedSlabSystem = getPredictedSlabSystemForPreviewWall(newWall, true);
    }

    for (let existingWall of state.walls) {
        const onSameFloor = newWall.floorId === existingWall.floorId;
        const onDifferentFloor = newWall.floorId !== existingWall.floorId;

        // Internal walls don't create restriction zones for external walls
        if (!newWallIsInternal && isInternalWall(existingWall)) continue;

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

        // For returning wall overrides, only exempt if the new wall connects
        // at one of the returning wall's endpoints, not the entire zone.
        if (state.returningWallOverrides.has(existingWall)) {
            const newEndpoints = [newWall.pointA, newWall.pointB];
            const connectsAtEndpoint = newEndpoints.some(ep =>
                isNearWallEndpoint(ep.x, ep.y, existingWall, 10)
            );
            if (connectsAtEndpoint) continue;
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
            // Auto-flip handles orientation, merge handles overlap, thickness conversion handles thickness
            if (onSameFloor && dist < 10) {
                continue;
            }

            // Cross-floor: Only check rules for consecutive levels (adjacent floors)
            const floorDiff = Math.abs(newWall.floorId - existingWall.floorId);

            if (onDifferentFloor && floorDiff <= 1) {
                // Same grid line on adjacent floor — auto-flip/merge/thickness handles it
                if (dist < 10) {
                    continue;
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
    const wallIsNonStructural = isInternalWall(wall);

    // Check length (different minimums for structural vs non-structural)
    const minLen = wallIsNonStructural ? MIN_WALL_LENGTH_NON_STRUCTURAL : MIN_WALL_LENGTH;
    if (wall.length < minLen) {
        violations.push({
            type: 'error',
            message: `Wall is too short (${Math.round(wall.length / 10)}cm). Minimum: ${minLen / 10}cm`
        });
    }

    // Structural walls must be on the 300mm grid (position and length)
    if (!wallIsNonStructural) {
        if (!isOnExternalGrid(wall)) {
            violations.push({
                type: 'error',
                message: 'Structural wall must be on the 30cm grid'
            });
        }
        if (wall.length % GRID_SIZE_EXTERNAL >= 5) {
            violations.push({
                type: 'error',
                message: 'Structural wall length must be a multiple of 30cm'
            });
        }
        if (wall.thickness === 100) {
            violations.push({
                type: 'error',
                message: 'Structural walls cannot be 10cm thick'
            });
        }
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
            // Skip distance validation for returning wall pairs — they are
            // intentionally close after the center-axis flip.
            if (areReturningWallPair(wall, otherWall)) return;

            // Non-structural walls have no distance restrictions
            if (isInternalWall(wall) || isInternalWall(otherWall)) return;

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
