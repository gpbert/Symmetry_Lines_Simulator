// interaction.js — Shared mouse/keyboard handlers for the Symmetry Line Simulator
import * as sim from './sim.js';
import { Wall, state } from './sim.js';

const {
    GRID_SIZE_EXTERNAL, GRID_SIZE_INTERNAL, MIN_WALL_LENGTH, WALL_LENGTH_GRID,
    VOID_GRID, MIN_VOID_SIZE
} = sim;

// ============================================================
// Dependencies injected at init time
// ============================================================
let getRenderer = null;
let showToastFn = null;
let updateUIFn = null;
let updateBuildingEnvelopesFn = null;
let validateAllWallsFn = null;
let clearDrawingToastFn = null;
let updateDrawingToastFn = null;

// ============================================================
// Interaction state
// ============================================================
let drawingWall = null;
let tempPoint = null;
let wallFlipped = false;
let manualFlip = false; // true when user pressed Space to flip — prevents auto-flip override
let isDrawingInternalWall = false;
let isDrawingFromEnvelope = false; // true when starting from an envelope wall endpoint

let drawingToastElement = null;
let drawingVoid = null;
let isDragging = false;
let dragStartPos = null;
let originalWallPos = null;
let stretchingWall = null;
let stretchingEndpoint = null;  // 'A' or 'B'
let originalStretchPoint = null;
let resizingVoid = null;
let originalVoidState = null;
let currentMousePos = null;
let currentMouseScreenPos = null;

// ============================================================
// Public interaction state (read-only getters for renderer)
// ============================================================
export const interactionState = {
    get drawingWall() { return drawingWall; },
    get tempPoint() { return tempPoint; },
    get wallFlipped() { return wallFlipped; },
    get isDrawingInternalWall() { return isDrawingInternalWall; },
    get isDrawingFromEnvelope() { return isDrawingFromEnvelope; },
    get drawingVoid() { return drawingVoid; },
    get stretchingWall() { return stretchingWall; },
    get stretchingEndpoint() { return stretchingEndpoint; },
    get resizingVoid() { return resizingVoid; },
    get currentMousePos() { return currentMousePos; },
    get currentMouseScreenPos() { return currentMouseScreenPos; },
    get updateDrawingToast() { return updateDrawingToastFn; },
};

// ============================================================
// Helpers
// ============================================================

// Shrink a wall endpoint to avoid body-level restriction zone overlaps.
// Returns the adjusted endpoint (or the original if no shrinking needed).
function shrinkToAvoidRestriction(startPt, endPt, lengthGrid) {
    const shiftX = startPt._shiftX || 0;
    const shiftY = startPt._shiftY || 0;
    const thickness = parseInt(document.getElementById('wallThickness').value);
    const isHorizontal = Math.abs(endPt.x - startPt.x) > Math.abs(endPt.y - startPt.y);
    const direction = isHorizontal
        ? (endPt.x > startPt.x ? 1 : -1)
        : (endPt.y > startPt.y ? 1 : -1);

    const fullWall = new Wall(
        startPt.x + shiftX, startPt.y + shiftY,
        endPt.x + shiftX, endPt.y + shiftY,
        thickness, 2700, null, state.currentFloorId
    );
    const restriction = sim.isWallInRestrictedZone(fullWall);

    if (!restriction.restricted || !restriction.wall || !fullWall.overlapsInProjection(restriction.wall)) {
        return endPt;
    }

    let currentLength = isHorizontal
        ? Math.abs(endPt.x - startPt.x)
        : Math.abs(endPt.y - startPt.y);

    currentLength -= lengthGrid;
    while (currentLength >= MIN_WALL_LENGTH) {
        const testEnd = isHorizontal
            ? { x: startPt.x + direction * currentLength, y: startPt.y }
            : { x: startPt.x, y: startPt.y + direction * currentLength };
        const testWall = new Wall(
            startPt.x + shiftX, startPt.y + shiftY,
            testEnd.x + shiftX, testEnd.y + shiftY,
            thickness, 2700, null, state.currentFloorId
        );
        const testRestriction = sim.isWallInRestrictedZone(testWall);
        if (!testRestriction.restricted || !testWall.overlapsInProjection(testRestriction.wall)) {
            return testEnd;
        }
        currentLength -= lengthGrid;
    }
    return { x: startPt.x, y: startPt.y };
}

// ============================================================
// Init
// ============================================================
export function initInteraction(rendererGetter, opts) {
    getRenderer = rendererGetter;
    showToastFn = opts.showToast;
    updateUIFn = opts.updateUI;
    updateBuildingEnvelopesFn = opts.updateBuildingEnvelopes;
    validateAllWallsFn = opts.validateAllWalls;
    clearDrawingToastFn = opts.clearDrawingToast;
    updateDrawingToastFn = opts.updateDrawingToast;
}

// ============================================================
// Convenience helpers
// ============================================================
function renderer() { return getRenderer(); }
function showToast(msg, type, dur) { if (showToastFn) showToastFn(msg, type, dur); }
function updateUI() { if (updateUIFn) updateUIFn(); }
function updateBuildingEnvelopes() { if (updateBuildingEnvelopesFn) updateBuildingEnvelopesFn(); }
function validateAllWalls() { if (validateAllWallsFn) validateAllWallsFn(); }
function clearDrawingToast() { if (clearDrawingToastFn) clearDrawingToastFn(); }

// ============================================================
// Reset helpers (called from sidebar buttons in index.html)
// ============================================================
export function resetDrawingState() {
    drawingWall = null;
    tempPoint = null;
    wallFlipped = false;
    manualFlip = false;
    isDrawingInternalWall = false;
    isDrawingFromEnvelope = false;

    drawingVoid = null;
    clearDrawingToast();
}

// ============================================================
// Event handlers
// ============================================================
function onMouseDown(e) {
    const r = renderer();
    const canvas = r.getCanvas();

    // Navigation: middle-click or ctrl+click for panning
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        r.isPanning = true;
        // Store last pan position on the renderer's panOffset is handled by mousemove
        // We store it here as a module-level helper
        _lastPanClientX = e.clientX;
        _lastPanClientY = e.clientY;
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
        return;
    }

    const pos = r.screenToWorld(e);
    currentMouseScreenPos = { x: pos.screenX, y: pos.screenY };

    if (state.currentMode === 'draw') {
        if (!drawingWall) {
            wallFlipped = false;
            manualFlip = false;

            // Detect if click is inside a closed envelope → internal wall mode (100mm grid)
            const envelope = sim.getEnvelopeContainingPoint(pos.x, pos.y, state.currentFloorId);
            isDrawingInternalWall = !!envelope;
            const gridSize = isDrawingInternalWall ? GRID_SIZE_INTERNAL : GRID_SIZE_EXTERNAL;

            // Detect if starting from an envelope wall endpoint (building extension)
            const snappedForCheck = {
                x: sim.snapToGrid(pos.x, gridSize),
                y: sim.snapToGrid(pos.y, gridSize)
            };
            // isDrawingFromEnvelope: true when starting from extension OR envelope body.
            // Used for skipEnvelopeZone (endpoint snapping) — unlocks grid positions near envelope.
            // The proximity shift and start nudging use more specific checks.
            isDrawingFromEnvelope = sim.isPointOnEnvelopeExtension(snappedForCheck.x, snappedForCheck.y, state.currentFloorId)
                || sim.isPointAtEnvelopeEndpoint(snappedForCheck.x, snappedForCheck.y, state.currentFloorId);

            // Re-snap to the correct grid (screenToWorld uses 100mm, external walls need 300mm)
            const snappedX = sim.snapToGrid(pos.x, gridSize);
            const snappedY = sim.snapToGrid(pos.y, gridSize);
            let nudged;
            const isOnExtension = sim.isPointOnEnvelopeExtension(snappedX, snappedY, state.currentFloorId);
            const isOnEnvBody = sim.isPointAtEnvelopeEndpoint(snappedX, snappedY, state.currentFloorId);
            if (isDrawingInternalWall || isOnExtension || isOnEnvBody) {
                // Non-structural, at extension, or at envelope body: free placement, no nudging
                nudged = { x: snappedX, y: snappedY };
            } else {
                nudged = sim.nudgeStartPointOutOfZones(snappedX, snappedY, state.currentFloorId, gridSize);
                // If fully blocked, try nudging again from the new position
                if (sim.isStartPointFullyBlocked(nudged.x, nudged.y, state.currentFloorId)) {
                    const reNudged = sim.nudgeStartPointOutOfZones(nudged.x, nudged.y, state.currentFloorId, gridSize);
                    if (!sim.isStartPointFullyBlocked(reNudged.x, reNudged.y, state.currentFloorId)) {
                        nudged = reNudged;
                    }
                }
            }
            drawingWall = { x: nudged.x, y: nudged.y };
            tempPoint = { x: nudged.x, y: nudged.y };
        } else {
            // Finish drawing
            const thickness = parseInt(document.getElementById('wallThickness').value);
            const height = 2700;

            const dx = Math.abs(pos.x - drawingWall.x);
            const dy = Math.abs(pos.y - drawingWall.y);
            let finalPos = pos;
            if (dx > dy) {
                finalPos = { x: pos.x, y: drawingWall.y };
            } else {
                finalPos = { x: drawingWall.x, y: pos.y };
            }

            const placementLengthGrid = isDrawingInternalWall ? GRID_SIZE_INTERNAL : sim.WALL_LENGTH_GRID;
            const skipEnvelopeZoneOnPlace = isDrawingFromEnvelope && state.featureToggles?.dynamicEnvelopeGridlines;
            finalPos = sim.snapLengthToGrid(drawingWall, finalPos, state.currentFloorId, placementLengthGrid, skipEnvelopeZoneOnPlace);

            // When restriction error feedback is OFF, shrink to avoid restricted zones
            if (finalPos && !state.featureToggles?.restrictionErrorFeedback && !isDrawingInternalWall) {
                finalPos = shrinkToAvoidRestriction(drawingWall, finalPos, placementLengthGrid);
            }

            // Apply envelope proximity shift if present
            const shiftX = drawingWall._shiftX || 0;
            const shiftY = drawingWall._shiftY || 0;

            const startX = (wallFlipped ? finalPos.x : drawingWall.x) + shiftX;
            const startY = (wallFlipped ? finalPos.y : drawingWall.y) + shiftY;
            const endX = (wallFlipped ? drawingWall.x : finalPos.x) + shiftX;
            const endY = (wallFlipped ? drawingWall.y : finalPos.y) + shiftY;

            const newWall = new Wall(
                startX, startY, endX, endY,
                thickness, height, null, state.currentFloorId
            );

            const minLen = isDrawingInternalWall ? sim.MIN_WALL_LENGTH_NON_STRUCTURAL : MIN_WALL_LENGTH;
            if (newWall.length < minLen) {
                showToast(`Wall is too short. Minimum length is ${minLen / 10}cm`, 'error');
                drawingWall = null;
                tempPoint = null;
                clearDrawingToast();
                r.draw();
                return;
            }

            // Check if this wall can merge with an existing aligned wall
            const merge = sim.findMergeableWall(newWall);
            if (merge) {
                sim.addToHistory();
                const merged = sim.computeMergedWall(newWall, merge.wall);
                merge.wall.pointA = { x: merged.ax, y: merged.ay };
                merge.wall.pointB = { x: merged.bx, y: merged.by };
                merge.wall.thickness = newWall.thickness;
                merge.wall.updateVectors();

                // Convert all other aligned walls on the same grid line to the new thickness
                const allAligned = sim.findAllAlignedWalls(newWall);
                allAligned.forEach(({ wall }) => {
                    if (wall !== merge.wall && wall.thickness !== newWall.thickness) {
                        wall.thickness = newWall.thickness;
                        wall.updateVectors();
                    }
                });

                updateBuildingEnvelopes();
            } else {
                // Internal walls must stay within the envelope
                if (isDrawingInternalWall) {
                    const endEnvelope = sim.getEnvelopeContainingPoint(
                        newWall.pointB.x, newWall.pointB.y, state.currentFloorId
                    );
                    if (!endEnvelope) {
                        showToast('Internal wall must stay within the building envelope.', 'error');
                        drawingWall = null;
                        tempPoint = null;
                        isDrawingInternalWall = false;
            isDrawingFromEnvelope = false;
                        clearDrawingToast();
                        r.draw();
                        return;
                    }
                }

                // Block placement if wall faces toward an envelope (must face away)
                if (sim.shouldFlipAwayFromEnvelope(newWall)) {
                    showToast('Wall must face away from the building envelope.', 'error');
                    drawingWall = null;
                    tempPoint = null;
                    clearDrawingToast();
                    r.draw();
                    return;
                }

                const restriction = sim.isWallInRestrictedZone(newWall);
                if (restriction.restricted) {
                    let message = 'Cannot place wall here.';
                    if (restriction.zone.reason) {
                        message += ` ${restriction.zone.reason}`;
                    } else if (restriction.zone.distance) {
                        message += ` Too close to existing wall. Minimum distance required: ${restriction.zone.distance / 10}cm`;
                    }
                    showToast(message, 'error');
                    drawingWall = null;
                    tempPoint = null;
                    clearDrawingToast();
                    r.draw();
                    return;
                }

                state.walls.push(newWall);
                sim.addToHistory([newWall]);

                // Convert aligned walls on adjacent floors to the new thickness
                const allAligned = sim.findAllAlignedWalls(newWall);
                allAligned.forEach(({ wall }) => {
                    if (wall !== newWall && wall.thickness !== newWall.thickness) {
                        wall.thickness = newWall.thickness;
                        wall.updateVectors();
                    }
                });

                updateBuildingEnvelopes();
            }

            drawingWall = null;
            tempPoint = null;
            wallFlipped = false;
            manualFlip = false;
            isDrawingInternalWall = false;
            isDrawingFromEnvelope = false;
        
            clearDrawingToast();
            updateUI();
            validateAllWalls();
        }
    } else if (state.currentMode === 'select') {
        // Check if clicked on a resize handle of the selected void
        if (state.selectedVoid) {
            const handle = sim.getVoidResizeHandle(pos, state.selectedVoid);
            if (handle) {
                resizingVoid = { void: state.selectedVoid, handle: handle };
                originalVoidState = { x: state.selectedVoid.x, y: state.selectedVoid.y, width: state.selectedVoid.width, height: state.selectedVoid.height };
                canvas.style.cursor = handle + '-resize';
                return;
            }
        }

        const endpointHit = sim.getEndpointNearPoint(pos.x, pos.y, 20, r.zoomLevel);

        if (endpointHit && state.selectedWalls.includes(endpointHit.wall)) {
            stretchingWall = endpointHit.wall;
            stretchingEndpoint = endpointHit.endpoint;
            originalStretchPoint = {
                ax: stretchingWall.pointA.x,
                ay: stretchingWall.pointA.y,
                bx: stretchingWall.pointB.x,
                by: stretchingWall.pointB.y
            };
            canvas.style.cursor = 'grab';
        } else {
            let clickedWall = null;
            for (let i = state.walls.length - 1; i >= 0; i--) {
                if (state.walls[i].floorId === state.currentFloorId && state.walls[i].containsPoint(pos.x, pos.y)) {
                    clickedWall = state.walls[i];
                    break;
                }
            }

            if (e.shiftKey && clickedWall) {
                const index = state.selectedWalls.indexOf(clickedWall);
                if (index > -1) {
                    state.selectedWalls.splice(index, 1);
                } else {
                    state.selectedWalls.push(clickedWall);
                }
                state.selectedVoid = null;
            } else if (clickedWall) {
                state.selectedWalls = [clickedWall];
                state.selectedVoid = null;

                isDragging = true;
                dragStartPos = pos;
                originalWallPos = {
                    ax: clickedWall.pointA.x,
                    ay: clickedWall.pointA.y,
                    bx: clickedWall.pointB.x,
                    by: clickedWall.pointB.y
                };
                canvas.style.cursor = 'grabbing';
            } else {
                const clickedVoid = sim.getVoidAtPoint(pos.x, pos.y, state.currentFloorId);
                if (clickedVoid) {
                    state.selectedWalls = [];
                    state.selectedVoid = clickedVoid;
                } else {
                    state.selectedWalls = [];
                    state.selectedVoid = null;
                }
            }
        }

        updateUI();
        r.draw();
    } else if (state.currentMode === 'delete') {
        let clickedWall = null;
        for (let i = state.walls.length - 1; i >= 0; i--) {
            if (state.walls[i].floorId === state.currentFloorId && state.walls[i].containsPoint(pos.x, pos.y)) {
                clickedWall = state.walls[i];
                break;
            }
        }

        if (clickedWall) {
            sim.addToHistory();
            const index = state.walls.indexOf(clickedWall);
            if (index > -1) {
                state.walls.splice(index, 1);
                showToast('Deleted 1 wall', 'info', 2000);
                updateUI();
                validateAllWalls();
            }
        }
        if (!clickedWall) {
            const clickedVoid = sim.getVoidAtPoint(pos.x, pos.y, state.currentFloorId);
            if (clickedVoid) {
                const idx = state.voids.indexOf(clickedVoid);
                if (idx !== -1) {
                    state.voids.splice(idx, 1);
                    sim.addVoidDeletionToHistory(clickedVoid);
                    showToast('Void deleted', 'info', 2000);
                    r.draw();
                }
            }
        }
    } else if (state.currentMode === 'void') {
        if (!drawingVoid) {
            const snappedX = sim.snapToVoidGrid(pos.x);
            const snappedY = sim.snapToVoidGrid(pos.y);
            drawingVoid = { startX: snappedX, startY: snappedY };
        } else {
            const snappedX = sim.snapToVoidGrid(pos.x);
            const snappedY = sim.snapToVoidGrid(pos.y);
            const x = Math.min(drawingVoid.startX, snappedX);
            const y = Math.min(drawingVoid.startY, snappedY);
            const width = Math.abs(snappedX - drawingVoid.startX);
            const height = Math.abs(snappedY - drawingVoid.startY);
            if (width < MIN_VOID_SIZE || height < MIN_VOID_SIZE) {
                showToast(`Void is too small. Minimum size: ${MIN_VOID_SIZE / 10}cm x ${MIN_VOID_SIZE / 10}cm`, 'error');
                drawingVoid = null;
                r.draw();
                return;
            }
            const overlaps = state.voids.some(v =>
                v.floorId === state.currentFloorId &&
                x < v.x + v.width && x + width > v.x &&
                y < v.y + v.height && y + height > v.y
            );
            if (overlaps) {
                showToast('Voids cannot overlap', 'error');
                drawingVoid = null;
                r.draw();
                return;
            }
            const newVoid = {
                id: sim.generateVoidId(),
                floorId: state.currentFloorId,
                x: x, y: y,
                width: width, height: height
            };
            const proximityViolations = sim.validateVoidWallProximity(newVoid);
            if (proximityViolations.length > 0) {
                showToast(proximityViolations[0].message, 'error');
                drawingVoid = null;
                r.draw();
                return;
            }
            state.voids.push(newVoid);
            sim.addToHistory([newVoid], 'void');
            drawingVoid = null;
            r.draw();
            showToast('Void placed', 'info', 2000);
        }
    }
}

// Pan state (shared between mousedown/mousemove/mouseup)
let _lastPanClientX = 0;
let _lastPanClientY = 0;

function onMouseUp(e) {
    const r = renderer();
    const canvas = r.getCanvas();

    if (r.isPanning) {
        r.isPanning = false;
        canvas.style.cursor = state.currentMode === 'draw' ? 'crosshair' : 'pointer';
    }

    if (stretchingWall) {
        const wasStretched = originalStretchPoint && (
            stretchingWall.pointA.x !== originalStretchPoint.ax ||
            stretchingWall.pointA.y !== originalStretchPoint.ay ||
            stretchingWall.pointB.x !== originalStretchPoint.bx ||
            stretchingWall.pointB.y !== originalStretchPoint.by
        );

        if (wasStretched) {
            sim.addToHistory();
            updateBuildingEnvelopes();
            state.selectedWalls = [];
        }

        stretchingWall = null;
        stretchingEndpoint = null;
        originalStretchPoint = null;
        canvas.style.cursor = 'pointer';
        validateAllWalls();
        r.draw();
    }

    if (resizingVoid) {
        const v = resizingVoid.void;
        const overlaps = state.voids.some(other =>
            other !== v && other.floorId === v.floorId &&
            v.x < other.x + other.width && v.x + v.width > other.x &&
            v.y < other.y + other.height && v.y + v.height > other.y
        );
        if (overlaps) {
            v.x = originalVoidState.x; v.y = originalVoidState.y;
            v.width = originalVoidState.width; v.height = originalVoidState.height;
            showToast('Resize would overlap another void', 'error');
        } else {
            const operation = {
                objectType: 'void-resize',
                voidRef: v,
                oldState: { ...originalVoidState },
                newState: { x: v.x, y: v.y, width: v.width, height: v.height },
                timestamp: Date.now()
            };
            state.history.push(operation);
            state.redoHistory = [];
        }
        resizingVoid = null;
        originalVoidState = null;
        canvas.style.cursor = 'pointer';
        r.draw();
    }

    if (isDragging) {
        const selectedWall = state.selectedWalls[0];
        const wasMoved = selectedWall && originalWallPos && (
            selectedWall.pointA.x !== originalWallPos.ax ||
            selectedWall.pointA.y !== originalWallPos.ay ||
            selectedWall.pointB.x !== originalWallPos.bx ||
            selectedWall.pointB.y !== originalWallPos.by
        );

        isDragging = false;
        canvas.style.cursor = 'pointer';

        if (wasMoved) {
            sim.addToHistory();
            updateBuildingEnvelopes();
            state.selectedWalls = [];
        }

        dragStartPos = null;
        originalWallPos = null;
        validateAllWalls();
        r.draw();
    }
}

function onMouseMove(e) {
    const r = renderer();

    if (r.isPanning) {
        const dx = e.clientX - _lastPanClientX;
        const dy = e.clientY - _lastPanClientY;
        r.panOffset.x += dx;
        r.panOffset.y += dy;
        _lastPanClientX = e.clientX;
        _lastPanClientY = e.clientY;
        r.draw();
        return;
    }

    const pos = r.screenToWorld(e);
    // Nudge hover point out of restriction zones before first click
    if (state.currentMode === 'draw' && !drawingWall) {
        const hoverEnvelope = sim.getEnvelopeContainingPoint(pos.x, pos.y, state.currentFloorId);
        const hoverGridSize = hoverEnvelope ? GRID_SIZE_INTERNAL : GRID_SIZE_EXTERNAL;
        const snappedX = sim.snapToGrid(pos.x, hoverGridSize);
        const snappedY = sim.snapToGrid(pos.y, hoverGridSize);
        let nudged;
        const hoverAtExtension = sim.isPointOnEnvelopeExtension(snappedX, snappedY, state.currentFloorId);
        const hoverAtEnvBody = sim.isPointAtEnvelopeEndpoint(snappedX, snappedY, state.currentFloorId);
        if (hoverEnvelope || hoverAtExtension || hoverAtEnvBody) {
            // Inside envelope or at extension endpoint: free placement, no nudging
            nudged = { x: snappedX, y: snappedY };
        } else {
            nudged = sim.nudgeStartPointOutOfZones(snappedX, snappedY, state.currentFloorId, hoverGridSize);
        }
        // If the nudged point is fully blocked (no valid wall in any direction), nudge further
        if (!hoverEnvelope && sim.isStartPointFullyBlocked(nudged.x, nudged.y, state.currentFloorId)) {
            // Try nudging from the original point in the opposite direction
            const reNudged = sim.nudgeStartPointOutOfZones(nudged.x, nudged.y, state.currentFloorId, hoverGridSize);
            if (!sim.isStartPointFullyBlocked(reNudged.x, reNudged.y, state.currentFloorId)) {
                nudged = reNudged;
            }
        }
        currentMousePos = { x: nudged.x, y: nudged.y };
    } else {
        currentMousePos = { x: pos.x, y: pos.y };
    }
    currentMouseScreenPos = { x: pos.screenX, y: pos.screenY };

    // Handle void resizing
    if (state.currentMode === 'select' && resizingVoid) {
        const v = resizingVoid.void;
        const h = resizingVoid.handle;
        const snappedX = sim.snapToVoidGrid(pos.x);
        const snappedY = sim.snapToVoidGrid(pos.y);
        let newX = v.x, newY = v.y, newW = v.width, newH = v.height;
        if (h.includes('w')) { newX = snappedX; newW = originalVoidState.x + originalVoidState.width - snappedX; }
        if (h.includes('e')) { newW = snappedX - originalVoidState.x; }
        if (h.includes('n')) { newY = snappedY; newH = originalVoidState.y + originalVoidState.height - snappedY; }
        if (h.includes('s')) { newH = snappedY - originalVoidState.y; }
        if (h === 'n' || h === 's') { newX = v.x; newW = v.width; }
        if (h === 'e' || h === 'w') { newY = v.y; newH = v.height; }
        if (newW >= MIN_VOID_SIZE && newH >= MIN_VOID_SIZE) {
            v.x = newX; v.y = newY; v.width = newW; v.height = newH;
        }
        r.draw();
        return;
    }

    // Handle wall stretching
    if (state.currentMode === 'select' && stretchingWall) {
        const wallIsInternal = sim.isInternalWall(stretchingWall);
        const stretchGrid = wallIsInternal ? GRID_SIZE_INTERNAL : GRID_SIZE_EXTERNAL;
        const stretchLengthGrid = wallIsInternal ? GRID_SIZE_INTERNAL : sim.WALL_LENGTH_GRID;
        const isHorizontal = Math.abs(originalStretchPoint.bx - originalStretchPoint.ax) >
                            Math.abs(originalStretchPoint.by - originalStretchPoint.ay);

        let newPoint;
        if (isHorizontal) {
            newPoint = {
                x: sim.snapToGrid(pos.x, stretchGrid),
                y: stretchingEndpoint === 'A' ? originalStretchPoint.ay : originalStretchPoint.by
            };
        } else {
            newPoint = {
                x: stretchingEndpoint === 'A' ? originalStretchPoint.ax : originalStretchPoint.bx,
                y: sim.snapToGrid(pos.y, stretchGrid)
            };
        }

        const otherPoint = stretchingEndpoint === 'A'
            ? { x: stretchingWall.pointB.x, y: stretchingWall.pointB.y }
            : { x: stretchingWall.pointA.x, y: stretchingWall.pointA.y };

        // Use snapLengthToGrid to compute the endpoint — this automatically
        // skips restricted grid lines, just like when drawing a new wall.
        const snapped = sim.snapLengthToGrid(otherPoint, newPoint, state.currentFloorId, stretchLengthGrid);

        // snapLengthToGrid returns the start point if length < MIN_WALL_LENGTH
        if (snapped.x === otherPoint.x && snapped.y === otherPoint.y) {
            // Would be too short — keep current position
            r.draw();
            return;
        }

        // Also validate against other wall rules
        const savedA = { ...stretchingWall.pointA };
        const savedB = { ...stretchingWall.pointB };

        if (stretchingEndpoint === 'A') {
            stretchingWall.pointA = snapped;
        } else {
            stretchingWall.pointB = snapped;
        }

        const isOffGrid = !wallIsInternal && !sim.isOnExternalGrid(stretchingWall);

        // If structural wall is off-grid (reverted from non-structural), snap the
        // other endpoint to 300mm grid too so the wall becomes fully grid-aligned
        if (isOffGrid) {
            if (stretchingEndpoint === 'A') {
                stretchingWall.pointB = {
                    x: sim.snapToGrid(stretchingWall.pointB.x, GRID_SIZE_EXTERNAL),
                    y: sim.snapToGrid(stretchingWall.pointB.y, GRID_SIZE_EXTERNAL)
                };
            } else {
                stretchingWall.pointA = {
                    x: sim.snapToGrid(stretchingWall.pointA.x, GRID_SIZE_EXTERNAL),
                    y: sim.snapToGrid(stretchingWall.pointA.y, GRID_SIZE_EXTERNAL)
                };
            }
        }

        stretchingWall.updateVectors();

        // Skip validation for off-grid walls — they need to get to a valid position first
        if (!isOffGrid) {
            const stretchIdx = state.walls.indexOf(stretchingWall);
            const violations = sim.validateWall(stretchingWall, stretchIdx);
            if (violations.some(v => v.type === 'error')) {
                stretchingWall.pointA = savedA;
                stretchingWall.pointB = savedB;
                stretchingWall.updateVectors();
            }
        }

        r.draw();
        return;
    }

    // Handle wall dragging
    if (state.currentMode === 'select' && isDragging && state.selectedWalls.length === 1) {
        const selectedWall = state.selectedWalls[0];
        const dragWallIsInternal = sim.isInternalWall(selectedWall);
        const isOffGrid = !dragWallIsInternal && !sim.isOnExternalGrid(selectedWall);
        const dragGrid = dragWallIsInternal ? GRID_SIZE_INTERNAL : GRID_SIZE_EXTERNAL;
        const offsetX = pos.x - dragStartPos.x;
        const offsetY = pos.y - dragStartPos.y;

        const snappedOffsetX = sim.snapToGrid(offsetX, dragGrid);
        const snappedOffsetY = sim.snapToGrid(offsetY, dragGrid);

        const savedA = { ...selectedWall.pointA };
        const savedB = { ...selectedWall.pointB };

        if (isOffGrid) {
            // Off-grid structural wall (reverted from non-structural):
            // Snap directly to 300mm grid positions. Skip restriction checks
            // since the wall needs to get to a valid position first.
            const isH = Math.abs(originalWallPos.bx - originalWallPos.ax) >
                        Math.abs(originalWallPos.by - originalWallPos.ay);
            let newAx = sim.snapToGrid(originalWallPos.ax + snappedOffsetX, GRID_SIZE_EXTERNAL);
            let newAy = sim.snapToGrid(originalWallPos.ay + snappedOffsetY, GRID_SIZE_EXTERNAL);
            let newBx, newBy;
            // Preserve wall direction, round length to nearest 300mm (min 600mm)
            if (isH) {
                newBy = newAy;
                const rawLen = Math.abs(originalWallPos.bx - originalWallPos.ax);
                const snappedLen = Math.max(MIN_WALL_LENGTH, Math.round(rawLen / GRID_SIZE_EXTERNAL) * GRID_SIZE_EXTERNAL);
                const dir = originalWallPos.bx > originalWallPos.ax ? 1 : -1;
                newBx = newAx + dir * snappedLen;
            } else {
                newBx = newAx;
                const rawLen = Math.abs(originalWallPos.by - originalWallPos.ay);
                const snappedLen = Math.max(MIN_WALL_LENGTH, Math.round(rawLen / GRID_SIZE_EXTERNAL) * GRID_SIZE_EXTERNAL);
                const dir = originalWallPos.by > originalWallPos.ay ? 1 : -1;
                newBy = newAy + dir * snappedLen;
            }
            selectedWall.pointA.x = newAx;
            selectedWall.pointA.y = newAy;
            selectedWall.pointB.x = newBx;
            selectedWall.pointB.y = newBy;
            selectedWall.updateVectors();
        } else {
            // Normal drag: apply offset with validation
            let newAx = originalWallPos.ax + snappedOffsetX;
            let newAy = originalWallPos.ay + snappedOffsetY;
            let newBx = originalWallPos.bx + snappedOffsetX;
            let newBy = originalWallPos.by + snappedOffsetY;

            // Check if either endpoint would land in a restriction zone
            const forInternal = dragWallIsInternal;
            const endpointARestricted = sim.findRestrictingWallAtPoint(newAx, newAy, selectedWall.floorId, forInternal);
            const endpointBRestricted = sim.findRestrictingWallAtPoint(newBx, newBy, selectedWall.floorId, forInternal);

            if (endpointARestricted || endpointBRestricted) {
                r.draw();
                return;
            }

            selectedWall.pointA.x = newAx;
            selectedWall.pointA.y = newAy;
            selectedWall.pointB.x = newBx;
            selectedWall.pointB.y = newBy;
            selectedWall.updateVectors();

            const dragIdx = state.walls.indexOf(selectedWall);
            const violations = sim.validateWall(selectedWall, dragIdx);
            if (violations.some(v => v.type === 'error')) {
                selectedWall.pointA = savedA;
                selectedWall.pointB = savedB;
                selectedWall.updateVectors();
            }
        }

        r.draw();
        return;
    }

    // Handle drawing preview
    if (state.currentMode === 'draw' && drawingWall) {
        const dx = Math.abs(pos.x - drawingWall.x);
        const dy = Math.abs(pos.y - drawingWall.y);

        let constrained;
        if (dx > dy) {
            constrained = { x: pos.x, y: drawingWall.y };
        } else {
            constrained = { x: drawingWall.x, y: pos.y };
        }

        const previewLengthGrid = isDrawingInternalWall ? GRID_SIZE_INTERNAL : sim.WALL_LENGTH_GRID;
        const skipEnvelopeZone = isDrawingFromEnvelope && state.featureToggles?.dynamicEnvelopeGridlines;
        tempPoint = sim.snapLengthToGrid(drawingWall, constrained, state.currentFloorId, previewLengthGrid, skipEnvelopeZone);

        // When restriction error feedback is OFF, shrink preview to avoid restricted zones
        // (snapLengthToGrid only checks endpoints, but the wall body can enter a zone)
        if (tempPoint && !state.featureToggles?.restrictionErrorFeedback && !isDrawingInternalWall) {
            tempPoint = shrinkToAvoidRestriction(drawingWall, tempPoint, previewLengthGrid);
        }

        // Check if the wall should shift away from an envelope wall's projection
        // Only active when the "Auto-shift walls near envelope zones" feature toggle is ON
        // Only skip shift when drawing from an actual envelope extension (not envelope body)
        const isOnExtension = sim.isPointOnEnvelopeExtension(drawingWall.x, drawingWall.y, state.currentFloorId);
        if (state.featureToggles?.envelopeShift && tempPoint && !isDrawingInternalWall && !isOnExtension) {
            const shift = sim.getEnvelopeProximityShift(
                drawingWall.x, drawingWall.y,
                tempPoint.x, tempPoint.y,
                state.currentFloorId
            );
            if (shift) {
                drawingWall._shiftX = shift.shiftX;
                drawingWall._shiftY = shift.shiftY;
            } else {
                drawingWall._shiftX = 0;
                drawingWall._shiftY = 0;
            }
        } else {
            drawingWall._shiftX = 0;
            drawingWall._shiftY = 0;
        }

        // Auto-flip logic (only when user hasn't manually flipped via Space):
        // 1. Same grid line: flip to match existing wall's orientation
        // 2. Different grid line + restricted: flip to resolve restriction
        if (tempPoint && !manualFlip) {
            const thickness = parseInt(document.getElementById('wallThickness').value);
            const sx = drawingWall._shiftX || 0;
            const sy = drawingWall._shiftY || 0;

            const normalWall = new Wall(
                drawingWall.x + sx, drawingWall.y + sy, tempPoint.x + sx, tempPoint.y + sy,
                thickness, 2700, null, state.currentFloorId
            );

            if (normalWall.length > 0) {
                const alignedWall = sim.findAlignedExistingWall(normalWall);
                if (alignedWall) {
                    // Same grid line — flip to match existing wall's orientation
                    wallFlipped = !normalWall.sameOrientation(alignedWall);
                } else {
                    // Check if the NORMAL wall should face away from envelope.
                    // Always test the unflipped wall to get a stable answer.
                    if (sim.shouldFlipAwayFromEnvelope(normalWall)) {
                        // Normal orientation faces toward envelope — must flip
                        wallFlipped = true;
                    } else {
                        // Also check the flipped orientation
                        const flippedWall = new Wall(
                            tempPoint.x + sx, tempPoint.y + sy, drawingWall.x + sx, drawingWall.y + sy,
                            thickness, 2700, null, state.currentFloorId
                        );
                        if (sim.shouldFlipAwayFromEnvelope(flippedWall)) {
                            // Flipped orientation faces toward envelope — must NOT flip
                            wallFlipped = false;
                        } else {
                            // Neither orientation is forced by envelope — check restrictions
                            const restriction = sim.isWallInRestrictedZone(normalWall);
                            if (restriction.restricted) {
                                const flippedRestriction = sim.isWallInRestrictedZone(flippedWall);
                                if (!flippedRestriction.restricted) {
                                    wallFlipped = true;
                                }
                            } else {
                                // No restriction — reset flip to default
                                wallFlipped = false;
                            }
                        }
                    }
                }
            }
        }
    }

    // Handle void drawing preview
    if (state.currentMode === 'void' && drawingVoid) {
        tempPoint = {
            x: sim.snapToVoidGrid(pos.x),
            y: sim.snapToVoidGrid(pos.y)
        };
    }

    r.draw();
}

function onMouseLeave() {
    const r = renderer();
    const canvas = r.getCanvas();

    if (r.isPanning) {
        r.isPanning = false;
        canvas.style.cursor = state.currentMode === 'draw' ? 'crosshair' : 'pointer';
    }

    if (stretchingWall) {
        stretchingWall.pointA = { x: originalStretchPoint.ax, y: originalStretchPoint.ay };
        stretchingWall.pointB = { x: originalStretchPoint.bx, y: originalStretchPoint.by };
        stretchingWall.updateVectors();
        stretchingWall = null;
        stretchingEndpoint = null;
        originalStretchPoint = null;
    }

    if (isDragging) {
        isDragging = false;
        canvas.style.cursor = 'pointer';
        dragStartPos = null;
        originalWallPos = null;
    }

    currentMousePos = null;
    r.draw();
}

function onKeyDown(e) {
    const r = renderer();

    // Space key to flip wall
    if (e.code === 'Space') {
        if (drawingWall && tempPoint) {
            e.preventDefault();
            // Only allow flip if the result would be valid
            const thickness = parseInt(document.getElementById('wallThickness').value);
            const flippedStartX = !wallFlipped ? tempPoint.x : drawingWall.x;
            const flippedStartY = !wallFlipped ? tempPoint.y : drawingWall.y;
            const flippedEndX   = !wallFlipped ? drawingWall.x : tempPoint.x;
            const flippedEndY   = !wallFlipped ? drawingWall.y : tempPoint.y;
            const flippedWall = new Wall(
                flippedStartX, flippedStartY, flippedEndX, flippedEndY,
                thickness, 2700, null, state.currentFloorId
            );
            const restriction = sim.isWallInRestrictedZone(flippedWall);
            const wouldFaceEnvelope = sim.shouldFlipAwayFromEnvelope(flippedWall);
            if (!restriction.restricted && !wouldFaceEnvelope) {
                wallFlipped = !wallFlipped;
                manualFlip = true;
            }
            r.draw();
        } else if (state.selectedWalls.length > 0) {
            e.preventDefault();
            sim.addToHistory();
            state.selectedWalls.forEach(wall => {
                const tp = wall.pointA;
                wall.pointA = wall.pointB;
                wall.pointB = tp;
                wall.updateVectors();
            });
            validateAllWalls();
            sim.updateBuildingEnvelopes();
            r.draw();
        }
    }

    // Escape to cancel wall drawing
    if (e.key === 'Escape' && drawingWall) {
        e.preventDefault();
        drawingWall = null;
        tempPoint = null;
        wallFlipped = false;
        manualFlip = false;
        isDrawingInternalWall = false;
    
        clearDrawingToast();
        r.draw();
    }

    // Ctrl+Z / Cmd+Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (updateUIFn && updateUIFn._undo) {
            updateUIFn._undo();
        }
    }

    // Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y for redo
    if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
        e.preventDefault();
        if (updateUIFn && updateUIFn._redo) {
            updateUIFn._redo();
        }
    }

    // Delete or Backspace to delete selected walls
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedWalls.length > 0 && state.currentMode === 'select') {
        e.preventDefault();
        sim.addToHistory();
        const count = state.selectedWalls.length;
        state.walls = state.walls.filter(wall => !state.selectedWalls.includes(wall));
        state.selectedWalls = [];
        updateBuildingEnvelopes();
        updateUI();
        validateAllWalls();
        showToast(`Deleted ${count} wall${count > 1 ? 's' : ''}`, 'info', 2000);
    }
}

// ============================================================
// Bind / Unbind
// ============================================================
export function bindToCanvas(canvasEl) {
    canvasEl.addEventListener('mousedown', onMouseDown);
    canvasEl.addEventListener('mouseup', onMouseUp);
    canvasEl.addEventListener('mousemove', onMouseMove);
    canvasEl.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('keydown', onKeyDown);
}

export function unbindFromCanvas(canvasEl) {
    canvasEl.removeEventListener('mousedown', onMouseDown);
    canvasEl.removeEventListener('mouseup', onMouseUp);
    canvasEl.removeEventListener('mousemove', onMouseMove);
    canvasEl.removeEventListener('mouseleave', onMouseLeave);
    window.removeEventListener('keydown', onKeyDown);
}
