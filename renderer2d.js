// renderer2d.js — Canvas 2D renderer for the Symmetry Line Simulator
import * as sim from './sim.js';
import { Wall, state } from './sim.js';

const {
    GRID_SIZE_EXTERNAL, GRID_SIZE_INTERNAL, COLUMN_SIZE,
    MIN_WALL_LENGTH, WALL_LENGTH_GRID, MIN_DISTANCE_PARALLEL,
    MIN_DISTANCE_OPPOSITE, VOID_GRID, MIN_VOID_SIZE
} = sim;

// ============================================================
// Constants
// ============================================================
const MM_TO_PX = 0.15; // Scale factor for visualization (1mm = 0.15px)

// ============================================================
// Canvas state
// ============================================================
let canvas = null;
let ctx = null;

// ============================================================
// Pan / Zoom state
// ============================================================
let panOffset = { x: 0, y: 0 };
let zoomLevel = 1.0;
let isPanning = false;
let lastPanPos = { x: 0, y: 0 };

// ============================================================
// Interaction state bridge
// Set by index.html via setInteractionState(); later replaced
// by a direct import from interaction.js.
// ============================================================
let _interactionState = {};

// ============================================================
// Coordinate helpers
// ============================================================
function mmToPx(mm) {
    return mm * MM_TO_PX;
}

function pxToMm(px) {
    return px / MM_TO_PX;
}

function pxSnapToGrid(px, gridSize = GRID_SIZE_EXTERNAL) {
    const mm = pxToMm(px);
    const snappedMm = sim.snapToGrid(mm, gridSize);
    return mmToPx(snappedMm);
}

// ============================================================
// Drawing helpers
// ============================================================
function drawGrid() {
    if (!ctx || !canvas) {
        console.error('Canvas not initialized in drawGrid!');
        return;
    }

    const gridStepExternal = mmToPx(GRID_SIZE_EXTERNAL);
    const gridStepInternal = mmToPx(GRID_SIZE_INTERNAL);

    // Calculate visible world bounds (in pixels) accounting for pan/zoom
    const visibleLeft = -panOffset.x / zoomLevel;
    const visibleTop = -panOffset.y / zoomLevel;
    const visibleRight = (canvas.width - panOffset.x) / zoomLevel;
    const visibleBottom = (canvas.height - panOffset.y) / zoomLevel;

    // Round to grid boundaries
    const startX = Math.floor(visibleLeft / gridStepExternal) * gridStepExternal;
    const endX = Math.ceil(visibleRight / gridStepExternal) * gridStepExternal;
    const startY = Math.floor(visibleTop / gridStepExternal) * gridStepExternal;
    const endY = Math.ceil(visibleBottom / gridStepExternal) * gridStepExternal;

    // Draw 300mm grid (external) - DARK, thicker lines
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 2 / zoomLevel;
    for (let x = startX; x <= endX; x += gridStepExternal) {
        ctx.beginPath();
        ctx.moveTo(x, visibleTop);
        ctx.lineTo(x, visibleBottom);
        ctx.stroke();
    }
    for (let y = startY; y <= endY; y += gridStepExternal) {
        ctx.beginPath();
        ctx.moveTo(visibleLeft, y);
        ctx.lineTo(visibleRight, y);
        ctx.stroke();
    }

    // Draw 100mm grid (internal) - lighter lines
    ctx.strokeStyle = '#dddddd';
    ctx.lineWidth = 0.5 / zoomLevel;

    const startXInternal = Math.floor(visibleLeft / gridStepInternal) * gridStepInternal;
    const endXInternal = Math.ceil(visibleRight / gridStepInternal) * gridStepInternal;
    const startYInternal = Math.floor(visibleTop / gridStepInternal) * gridStepInternal;
    const endYInternal = Math.ceil(visibleBottom / gridStepInternal) * gridStepInternal;

    for (let x = startXInternal; x <= endXInternal; x += gridStepInternal) {
        if (Math.abs(x % gridStepExternal) < 0.5) continue;
        ctx.beginPath();
        ctx.moveTo(x, visibleTop);
        ctx.lineTo(x, visibleBottom);
        ctx.stroke();
    }
    for (let y = startYInternal; y <= endYInternal; y += gridStepInternal) {
        if (Math.abs(y % gridStepExternal) < 0.5) continue;
        ctx.beginPath();
        ctx.moveTo(visibleLeft, y);
        ctx.lineTo(visibleRight, y);
        ctx.stroke();
    }
}

function drawRestrictedZones() {
    state.walls.forEach(wall => {
        const zones = sim.getRestrictedZones(wall);

        zones.forEach(zone => {
            ctx.fillStyle = zone.type === 'opposite' ?
                'rgba(244, 67, 54, 0.1)' :
                'rgba(255, 152, 0, 0.08)';

            ctx.fillRect(
                mmToPx(zone.x1),
                mmToPx(zone.y1),
                mmToPx(zone.x2 - zone.x1),
                mmToPx(zone.y2 - zone.y1)
            );

            ctx.strokeStyle = zone.type === 'opposite' ?
                'rgba(244, 67, 54, 0.3)' :
                'rgba(255, 152, 0, 0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(
                mmToPx(zone.x1),
                mmToPx(zone.y1),
                mmToPx(zone.x2 - zone.x1),
                mmToPx(zone.y2 - zone.y1)
            );
            ctx.setLineDash([]);
        });
    });
}

function drawWall(wall, isSelected = false, violations = [], opacity = 1.0, overrideColor = null) {
    const hasViolation = violations.length > 0;
    const external = wall.getExternalFacePoints();

    ctx.globalAlpha = opacity;

    if (overrideColor) {
        ctx.fillStyle = overrideColor.replace(')', ', 0.15)').replace('rgb', 'rgba');
        ctx.strokeStyle = overrideColor;
    } else {
        ctx.fillStyle = hasViolation ? 'rgba(244, 67, 54, 0.2)' :
                       isSelected ? 'rgba(33, 150, 243, 0.3)' : 'rgba(158, 158, 158, 0.3)';
        ctx.strokeStyle = hasViolation ? '#f44336' :
                         isSelected ? '#2196F3' : '#757575';
    }
    ctx.lineWidth = isSelected ? 3 : 2;

    ctx.beginPath();
    ctx.moveTo(mmToPx(wall.pointA.x), mmToPx(wall.pointA.y));
    ctx.lineTo(mmToPx(wall.pointB.x), mmToPx(wall.pointB.y));
    ctx.lineTo(mmToPx(external.b.x), mmToPx(external.b.y));
    ctx.lineTo(mmToPx(external.a.x), mmToPx(external.a.y));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw INTERNAL face line (BLUE)
    if (overrideColor) {
        ctx.strokeStyle = overrideColor;
    } else {
        ctx.strokeStyle = '#2196F3';
    }
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mmToPx(wall.pointA.x), mmToPx(wall.pointA.y));
    ctx.lineTo(mmToPx(wall.pointB.x), mmToPx(wall.pointB.y));
    ctx.stroke();

    // Draw external face line
    if (overrideColor) {
        ctx.strokeStyle = overrideColor;
    } else {
        ctx.strokeStyle = hasViolation ? '#d32f2f' :
                         isSelected ? '#1976D2' : '#424242';
    }
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(mmToPx(external.a.x), mmToPx(external.a.y));
    ctx.lineTo(mmToPx(external.b.x), mmToPx(external.b.y));
    ctx.stroke();

    // Draw steel columns
    const columnSize = mmToPx(COLUMN_SIZE);
    if (overrideColor) {
        ctx.fillStyle = overrideColor;
    } else {
        ctx.fillStyle = hasViolation ? '#f44336' :
                       isSelected ? '#2196F3' : '#616161';
    }

    const colAX = wall.pointA.x + (COLUMN_SIZE / 2) * wall.dNorm.x + (COLUMN_SIZE / 2) * wall.n.x;
    const colAY = wall.pointA.y + (COLUMN_SIZE / 2) * wall.dNorm.y + (COLUMN_SIZE / 2) * wall.n.y;
    ctx.fillRect(
        mmToPx(colAX) - columnSize / 2,
        mmToPx(colAY) - columnSize / 2,
        columnSize,
        columnSize
    );

    const colBX = wall.pointB.x - (COLUMN_SIZE / 2) * wall.dNorm.x + (COLUMN_SIZE / 2) * wall.n.x;
    const colBY = wall.pointB.y - (COLUMN_SIZE / 2) * wall.dNorm.y + (COLUMN_SIZE / 2) * wall.n.y;
    ctx.fillRect(
        mmToPx(colBX) - columnSize / 2,
        mmToPx(colBY) - columnSize / 2,
        columnSize,
        columnSize
    );

    // Draw dimensions
    if (isSelected) {
        const midX = (wall.pointA.x + wall.pointB.x) / 2;
        const midY = (wall.pointA.y + wall.pointB.y) / 2;

        ctx.fillStyle = '#2196F3';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
            `${Math.round(wall.length / 10)}cm (${wall.thickness / 10}cm thick)`,
            mmToPx(midX),
            mmToPx(midY) - 15
        );
    }

    ctx.globalAlpha = 1.0;
}

function drawBuildingEnvelopes() {
    const showLevelsBelow = state.showLevelsBelow;
    const showLevelsAbove = state.showLevelsAbove;

    state.buildingEnvelopes.forEach(envelope => {
        const onCurrentFloor = envelope.floorId === state.currentFloorId;
        const onFloorBelow = envelope.floorId < state.currentFloorId;
        const onFloorAbove = envelope.floorId > state.currentFloorId;

        if (onFloorBelow && !showLevelsBelow) return;
        if (onFloorAbove && !showLevelsAbove) return;

        let baseOpacity = 0.05;
        let bounceScale = 1.0;

        if (onFloorBelow) {
            const floorsBelow = state.currentFloorId - envelope.floorId;
            baseOpacity = Math.max(0.02, 0.04 - (floorsBelow * 0.01));
        } else if (onFloorAbove) {
            const floorsAbove = envelope.floorId - state.currentFloorId;
            baseOpacity = Math.max(0.02, 0.04 - (floorsAbove * 0.01));
        }

        if (onCurrentFloor && state.newEnvelopeTimestamp) {
            const timeSinceAppear = Date.now() - state.newEnvelopeTimestamp;
            const animationDuration = 500;

            if (timeSinceAppear < animationDuration) {
                const progress = timeSinceAppear / animationDuration;
                bounceScale = 1 + Math.sin(progress * Math.PI) * 0.04 * (1 - progress);
            } else {
                state.newEnvelopeTimestamp = null;
            }
        }

        ctx.save();

        if (onFloorAbove) {
            ctx.globalAlpha = baseOpacity * 4;
            ctx.strokeStyle = '#2196F3';
            ctx.lineWidth = 1 / zoomLevel;
            ctx.setLineDash([6 / zoomLevel, 6 / zoomLevel]);

            ctx.beginPath();
            envelope.polygon.forEach((point, i) => {
                if (i === 0) {
                    ctx.moveTo(mmToPx(point.x), mmToPx(point.y));
                } else {
                    ctx.lineTo(mmToPx(point.x), mmToPx(point.y));
                }
            });
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.globalAlpha = baseOpacity;
        ctx.fillStyle = '#2196F3';

        if (onCurrentFloor && bounceScale !== 1.0) {
            let centerX = 0, centerY = 0;
            envelope.polygon.forEach(p => {
                centerX += p.x;
                centerY += p.y;
            });
            centerX /= envelope.polygon.length;
            centerY /= envelope.polygon.length;

            ctx.translate(mmToPx(centerX), mmToPx(centerY));
            ctx.scale(bounceScale, bounceScale);
            ctx.translate(-mmToPx(centerX), -mmToPx(centerY));
        }

        ctx.beginPath();
        envelope.polygon.forEach((point, i) => {
            if (i === 0) {
                ctx.moveTo(mmToPx(point.x), mmToPx(point.y));
            } else {
                ctx.lineTo(mmToPx(point.x), mmToPx(point.y));
            }
        });
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    });

    if (state.newEnvelopeTimestamp && (Date.now() - state.newEnvelopeTimestamp < 500)) {
        requestAnimationFrame(() => renderer2D.draw());
    }
}

function drawVoid(v, opacity = 1.0, isGhost = false) {
    const x = mmToPx(v.x);
    const y = mmToPx(v.y);
    const w = mmToPx(v.width);
    const h = mmToPx(v.height);
    ctx.save();
    if (isGhost) {
        ctx.strokeStyle = `rgba(220, 38, 38, ${opacity * 0.5})`;
        ctx.lineWidth = 1 / zoomLevel;
        ctx.setLineDash([4 / zoomLevel, 4 / zoomLevel]);
        ctx.strokeRect(x, y, w, h);
    } else {
        ctx.fillStyle = `rgba(220, 38, 38, ${opacity * 0.08})`;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = `rgba(220, 38, 38, ${opacity * 0.3})`;
        ctx.lineWidth = 1 / zoomLevel;
        ctx.beginPath();
        const step = 12 / zoomLevel;
        ctx.save();
        ctx.rect(x, y, w, h);
        ctx.clip();
        for (let i = -Math.max(w, h); i < Math.max(w, h) * 2; i += step) {
            ctx.moveTo(x + i, y);
            ctx.lineTo(x + i + Math.max(w, h), y + Math.max(w, h));
        }
        ctx.stroke();
        ctx.restore();
        const isSelected = state.selectedVoid === v;
        ctx.strokeStyle = isSelected ? 'rgba(37, 99, 235, 0.9)' : `rgba(220, 38, 38, ${opacity * 0.6})`;
        ctx.lineWidth = isSelected ? 2 / zoomLevel : 1.5 / zoomLevel;
        ctx.setLineDash(isSelected ? [6 / zoomLevel, 3 / zoomLevel] : []);
        ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
}

function drawSnapIndicator(x, y) {
    ctx.fillStyle = '#2196F3';
    ctx.beginPath();
    ctx.arc(mmToPx(x), mmToPx(y), 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 1;
    const size = 8;
    ctx.beginPath();
    ctx.moveTo(mmToPx(x) - size, mmToPx(y));
    ctx.lineTo(mmToPx(x) + size, mmToPx(y));
    ctx.moveTo(mmToPx(x), mmToPx(y) - size);
    ctx.lineTo(mmToPx(x), mmToPx(y) + size);
    ctx.stroke();
}

// ============================================================
// Main draw() function
// ============================================================
function draw() {
    if (!ctx || !canvas) {
        console.error('Canvas not initialized in draw!');
        return;
    }

    // Read interaction state
    const drawingWall = _interactionState.drawingWall;
    const tempPoint = _interactionState.tempPoint;
    const wallFlipped = _interactionState.wallFlipped;
    const drawingVoid = _interactionState.drawingVoid;
    const stretchingWall = _interactionState.stretchingWall;
    const stretchingEndpoint = _interactionState.stretchingEndpoint;
    const resizingVoid = _interactionState.resizingVoid;
    const currentMousePos = _interactionState.currentMousePos;
    const currentMouseScreenPos = _interactionState.currentMouseScreenPos;

    // Clear and fill background (before transformation)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply pan and zoom transformation
    ctx.setTransform(zoomLevel, 0, 0, zoomLevel, panOffset.x, panOffset.y);

    drawGrid();

    // Draw building envelopes (waffle slabs) - BEFORE walls so walls appear on top
    drawBuildingEnvelopes();

    // Draw envelope angle violation markers
    state.envelopeAngleViolations
        .filter(v => v.floorId === state.currentFloorId)
        .forEach(v => {
            ctx.fillStyle = 'rgba(220, 38, 38, 0.8)';
            ctx.beginPath();
            ctx.arc(mmToPx(v.point.x), mmToPx(v.point.y), 8 / zoomLevel, 0, Math.PI * 2);
            ctx.fill();
        });

    // Get violations for walls
    const wallViolations = new Map();
    state.walls.forEach((wall, idx) => {
        if (wall.floorId === state.currentFloorId ||
            wall.floorId === state.currentFloorId - 1 ||
            wall.floorId === state.currentFloorId + 1) {
            wallViolations.set(idx, sim.validateWall(wall, idx));
        }
    });

    // Draw walls from levels below if enabled
    if (state.showLevelsBelow) {
        state.walls.forEach((wall, idx) => {
            if (wall.floorId < state.currentFloorId) {
                const floorsBelow = state.currentFloorId - wall.floorId;
                const opacity = Math.max(0.1, 0.5 - (floorsBelow * 0.15));
                const violations = wallViolations.get(idx) || [];
                drawWall(wall, false, violations, opacity, violations.length > 0 ? null : '#90A4AE');
            }
        });
    }

    // Draw walls from levels above if enabled
    if (state.showLevelsAbove) {
        state.walls.forEach((wall, idx) => {
            if (wall.floorId > state.currentFloorId) {
                const floorsAbove = wall.floorId - state.currentFloorId;
                const violations = wallViolations.get(idx) || [];
                const hasViolation = violations.some(v => v.type === 'error');
                const external = wall.getExternalFacePoints();

                const fillOpacity = Math.max(0.08, 0.15 - (floorsAbove * 0.04));
                ctx.globalAlpha = fillOpacity;
                ctx.fillStyle = hasViolation ? '#f44336' : '#B0BEC5';

                ctx.beginPath();
                ctx.moveTo(mmToPx(wall.pointA.x), mmToPx(wall.pointA.y));
                ctx.lineTo(mmToPx(wall.pointB.x), mmToPx(wall.pointB.y));
                ctx.lineTo(mmToPx(external.b.x), mmToPx(external.b.y));
                ctx.lineTo(mmToPx(external.a.x), mmToPx(external.a.y));
                ctx.closePath();
                ctx.fill();

                const outlineOpacity = Math.max(0.2, 0.4 - (floorsAbove * 0.1));
                ctx.globalAlpha = outlineOpacity;
                ctx.strokeStyle = hasViolation ? '#f44336' : '#607D8B';
                ctx.lineWidth = 2 / zoomLevel;
                ctx.setLineDash([8 / zoomLevel, 8 / zoomLevel]);
                ctx.stroke();

                ctx.setLineDash([]);
                ctx.globalAlpha = 1.0;
            }
        });
    }

    // Draw voids from other floors (ghost)
    if (state.showLevelsBelow || state.showLevelsAbove) {
        state.voids.forEach(v => {
            if (v.floorId !== state.currentFloorId) {
                const floorDiff = Math.abs(v.floorId - state.currentFloorId);
                if (floorDiff <= 3) {
                    const ghostOpacity = floorDiff === 1 ? 0.4 : floorDiff === 2 ? 0.25 : 0.15;
                    drawVoid(v, ghostOpacity, true);
                }
            }
        });
    }

    // Track walls generating restriction zones (for pulsing effect while drawing)
    const restrictingWalls = new Set();

    // Get current level walls
    const currentFloorWalls = state.walls.filter(w => w.floorId === state.currentFloorId);

    // Draw current level walls
    state.walls.forEach((wall, idx) => {
        if (wall.floorId === state.currentFloorId) {
            const isSelected = state.selectedWalls.includes(wall);
            const violations = wallViolations.get(idx) || [];
            drawWall(wall, isSelected, violations);
        }
    });

    // Draw void proximity restricted face zones (purple) when in void mode
    if (state.currentMode === 'void') {
        const floorWalls = state.walls.filter(w => w.floorId === state.currentFloorId);
        floorWalls.forEach(wall => {
            const isInEnvelope = sim.isWallInEnvelope(wall);
            const faceOffset = isInEnvelope ? wall.thickness : 0;
            const zoneDepth = VOID_GRID;
            ctx.save();
            ctx.fillStyle = 'rgba(168, 85, 247, 0.08)';
            const ax = wall.pointA.x + wall.n.x * faceOffset;
            const ay = wall.pointA.y + wall.n.y * faceOffset;
            const bx = wall.pointB.x + wall.n.x * faceOffset;
            const by = wall.pointB.y + wall.n.y * faceOffset;
            const nx = wall.n.x * (isInEnvelope ? 1 : -1);
            const ny = wall.n.y * (isInEnvelope ? 1 : -1);
            ctx.beginPath();
            ctx.moveTo(mmToPx(ax), mmToPx(ay));
            ctx.lineTo(mmToPx(bx), mmToPx(by));
            ctx.lineTo(mmToPx(bx + nx * zoneDepth), mmToPx(by + ny * zoneDepth));
            ctx.lineTo(mmToPx(ax + nx * zoneDepth), mmToPx(ay + ny * zoneDepth));
            ctx.closePath();
            ctx.fill();
            // Hatch pattern
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.15)';
            ctx.lineWidth = 1 / zoomLevel;
            const step = 10 / zoomLevel;
            ctx.beginPath();
            ctx.save();
            ctx.clip();
            const minPx = Math.min(mmToPx(ax), mmToPx(bx), mmToPx(ax + nx * zoneDepth), mmToPx(bx + nx * zoneDepth));
            const maxPx = Math.max(mmToPx(ax), mmToPx(bx), mmToPx(ax + nx * zoneDepth), mmToPx(bx + nx * zoneDepth));
            const minPy = Math.min(mmToPx(ay), mmToPx(by), mmToPx(ay + ny * zoneDepth), mmToPx(by + ny * zoneDepth));
            const maxPy = Math.max(mmToPx(ay), mmToPx(by), mmToPx(ay + ny * zoneDepth), mmToPx(by + ny * zoneDepth));
            for (let i = minPx - (maxPy - minPy); i < maxPx + (maxPy - minPy); i += step) {
                ctx.moveTo(i, minPy);
                ctx.lineTo(i + (maxPy - minPy), maxPy);
            }
            ctx.stroke();
            ctx.restore();
            ctx.restore();
        });
    }

    // Draw current floor voids
    state.voids.filter(v => v.floorId === state.currentFloorId).forEach(v => {
        drawVoid(v);
    });

    // Draw resize handles for selected void
    if (state.selectedVoid && state.selectedVoid.floorId === state.currentFloorId) {
        const v = state.selectedVoid;
        const handleSize = 6 / zoomLevel;
        ctx.fillStyle = '#2563eb';
        const handles = [
            { x: v.x, y: v.y, cursor: 'nw' },
            { x: v.x + v.width / 2, y: v.y, cursor: 'n' },
            { x: v.x + v.width, y: v.y, cursor: 'ne' },
            { x: v.x + v.width, y: v.y + v.height / 2, cursor: 'e' },
            { x: v.x + v.width, y: v.y + v.height, cursor: 'se' },
            { x: v.x + v.width / 2, y: v.y + v.height, cursor: 's' },
            { x: v.x, y: v.y + v.height, cursor: 'sw' },
            { x: v.x, y: v.y + v.height / 2, cursor: 'w' },
        ];
        handles.forEach(h => {
            ctx.beginPath();
            ctx.rect(mmToPx(h.x) - handleSize / 2, mmToPx(h.y) - handleSize / 2, handleSize, handleSize);
            ctx.fill();
        });
    }

    // Draw endpoint handles in select mode (only for selected walls)
    if (state.currentMode === 'select' && state.selectedWalls.length > 0) {
        state.selectedWalls.forEach((wall) => {
            if (wall.floorId === state.currentFloorId) {
                ctx.save();

                let nearA = false;
                let nearB = false;
                if (currentMousePos) {
                    const worldThreshold = 20 / zoomLevel;
                    const distA = Math.sqrt(
                        Math.pow(currentMousePos.x - wall.pointA.x, 2) +
                        Math.pow(currentMousePos.y - wall.pointA.y, 2)
                    );
                    const distB = Math.sqrt(
                        Math.pow(currentMousePos.x - wall.pointB.x, 2) +
                        Math.pow(currentMousePos.y - wall.pointB.y, 2)
                    );
                    nearA = distA < worldThreshold;
                    nearB = distB < worldThreshold;
                }

                ctx.beginPath();
                ctx.arc(mmToPx(wall.pointA.x), mmToPx(wall.pointA.y), 8 / zoomLevel, 0, Math.PI * 2);
                ctx.fillStyle = nearA ? '#2563eb' : 'rgba(37, 99, 235, 0.5)';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2 / zoomLevel;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(mmToPx(wall.pointB.x), mmToPx(wall.pointB.y), 8 / zoomLevel, 0, Math.PI * 2);
                ctx.fillStyle = nearB ? '#2563eb' : 'rgba(37, 99, 235, 0.5)';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2 / zoomLevel;
                ctx.stroke();

                ctx.restore();
            }
        });
    }

    // Draw temporary wall while drawing
    if (drawingWall && tempPoint && (drawingWall.x !== tempPoint.x || drawingWall.y !== tempPoint.y)) {
        const startX = wallFlipped ? tempPoint.x : drawingWall.x;
        const startY = wallFlipped ? tempPoint.y : drawingWall.y;
        const endX = wallFlipped ? drawingWall.x : tempPoint.x;
        const endY = wallFlipped ? drawingWall.y : tempPoint.y;

        const tempWall = new Wall(
            startX,
            startY,
            endX,
            endY,
            parseInt(document.getElementById('wallThickness').value),
            2700,
            null,
            state.currentFloorId
        );

        // Draw dynamic restriction zones based on preview wall's orientation
        if (tempWall.length > 0) {
            state.walls.forEach((existingWall, idx) => {
                const floorDiff = Math.abs(existingWall.floorId - state.currentFloorId);
                if (floorDiff > 1) {
                    return;
                }

                const isParallel = existingWall.isParallelTo(tempWall);
                if (!isParallel) return;

                let previewIsInEnvelope = false;
                let existingIsInEnvelope = false;

                if (state.slabRestrictionsEnabled) {
                    const predictedSystem = sim.getPredictedSlabSystemForPreviewWall(tempWall, true);
                    const existingWallSlabs = sim.getWallSlabSystem(existingWall);
                    previewIsInEnvelope = predictedSystem !== null;

                    const existingPredictedSystem = sim.getPredictedSlabSystemForPreviewWall(existingWall);
                    existingIsInEnvelope = existingWallSlabs.length > 0 || existingPredictedSystem !== null;

                    if (previewIsInEnvelope && !existingIsInEnvelope) {
                        return;
                    } else if (!previewIsInEnvelope && existingIsInEnvelope) {
                        return;
                    }
                }

                const previewMidX = (tempWall.pointA.x + tempWall.pointB.x) / 2;
                const previewMidY = (tempWall.pointA.y + tempWall.pointB.y) / 2;

                const dist = tempWall.distanceToWall(existingWall);
                if (dist < 10) {
                    const sameOrientation = tempWall.sameOrientation(existingWall);
                    const sameThickness = tempWall.thickness === existingWall.thickness;

                    if (sameOrientation && sameThickness) {
                        return;
                    }

                    if (sameOrientation && !sameThickness) {
                        const onDifferentFloor = existingWall.floorId !== state.currentFloorId;
                        if (onDifferentFloor) {
                            restrictingWalls.add(idx);
                            return;
                        }
                    }

                    const requiredDistance = MIN_DISTANCE_PARALLEL;

                    restrictingWalls.add(idx);

                    ctx.fillStyle = 'rgba(244, 67, 54, 0.12)';

                    const isHorizontal = Math.abs(existingWall.d.y) < Math.abs(existingWall.d.x);
                    const internalY = existingWall.pointA.y;
                    const internalX = existingWall.pointA.x;

                    const visibleLeft = (-panOffset.x) / zoomLevel;
                    const visibleTop = (-panOffset.y) / zoomLevel;
                    const visibleRight = (canvas.width - panOffset.x) / zoomLevel;
                    const visibleBottom = (canvas.height - panOffset.y) / zoomLevel;
                    const margin = 100000;
                    const infiniteLeft = pxToMm(visibleLeft - margin);
                    const infiniteRight = pxToMm(visibleRight + margin);
                    const infiniteTop = pxToMm(visibleTop - margin);
                    const infiniteBottom = pxToMm(visibleBottom + margin);

                    if (isHorizontal) {
                        if (previewMidY > internalY) {
                            ctx.fillRect(
                                mmToPx(infiniteLeft),
                                mmToPx(internalY),
                                mmToPx(infiniteRight - infiniteLeft),
                                mmToPx(requiredDistance)
                            );
                        } else {
                            ctx.fillRect(
                                mmToPx(infiniteLeft),
                                mmToPx(internalY - requiredDistance),
                                mmToPx(infiniteRight - infiniteLeft),
                                mmToPx(requiredDistance)
                            );
                        }
                    } else {
                        if (previewMidX > internalX) {
                            ctx.fillRect(
                                mmToPx(internalX),
                                mmToPx(infiniteTop),
                                mmToPx(requiredDistance),
                                mmToPx(infiniteBottom - infiniteTop)
                            );
                        } else {
                            ctx.fillRect(
                                mmToPx(internalX - requiredDistance),
                                mmToPx(infiniteTop),
                                mmToPx(requiredDistance),
                                mmToPx(infiniteBottom - infiniteTop)
                            );
                        }
                    }
                    return;
                }

                const toPreview = {
                    x: previewMidX - existingWall.pointA.x,
                    y: previewMidY - existingWall.pointA.y
                };

                if (!tempWall.isParallelTo(existingWall)) {
                    return;
                }

                const actualDistance = tempWall.distanceToWall(existingWall);

                const orientationDot = tempWall.n.x * existingWall.n.x + tempWall.n.y * existingWall.n.y;
                let requiredDistance;

                if (orientationDot < -0.9) {
                    const toPreviewWall = {
                        x: previewMidX - existingWall.pointA.x,
                        y: previewMidY - existingWall.pointA.y
                    };

                    const existingToPreview = toPreviewWall.x * existingWall.n.x + toPreviewWall.y * existingWall.n.y;

                    if (existingToPreview > 0) {
                        requiredDistance = MIN_DISTANCE_OPPOSITE;
                    } else {
                        requiredDistance = MIN_DISTANCE_PARALLEL;
                    }
                } else {
                    requiredDistance = MIN_DISTANCE_PARALLEL;
                }

                if (actualDistance >= requiredDistance - 2) {
                    return;
                }

                restrictingWalls.add(idx);

                const zoneColor = 'rgba(244, 67, 54, 0.12)';

                const visibleLeft = -panOffset.x / zoomLevel;
                const visibleTop = -panOffset.y / zoomLevel;
                const visibleRight = (canvas.width - panOffset.x) / zoomLevel;
                const visibleBottom = (canvas.height - panOffset.y) / zoomLevel;
                const margin = 100000;
                const infiniteLeft = pxToMm(visibleLeft - margin);
                const infiniteRight = pxToMm(visibleRight + margin);
                const infiniteTop = pxToMm(visibleTop - margin);
                const infiniteBottom = pxToMm(visibleBottom + margin);

                const sideDot = toPreview.x * existingWall.n.x + toPreview.y * existingWall.n.y;

                const isHorizontal = Math.abs(existingWall.d.y) < Math.abs(existingWall.d.x);

                ctx.fillStyle = zoneColor;

                if (isHorizontal) {
                    const internalY = existingWall.pointA.y;

                    if (previewMidY > internalY) {
                        ctx.fillRect(
                            mmToPx(infiniteLeft),
                            mmToPx(internalY),
                            mmToPx(infiniteRight - infiniteLeft),
                            mmToPx(requiredDistance)
                        );
                    } else {
                        ctx.fillRect(
                            mmToPx(infiniteLeft),
                            mmToPx(internalY - requiredDistance),
                            mmToPx(infiniteRight - infiniteLeft),
                            mmToPx(requiredDistance)
                        );
                    }
                } else {
                    const internalX = existingWall.pointA.x;

                    if (previewMidX > internalX) {
                        ctx.fillRect(
                            mmToPx(internalX),
                            mmToPx(infiniteTop),
                            mmToPx(requiredDistance),
                            mmToPx(infiniteBottom - infiniteTop)
                        );
                    } else {
                        ctx.fillRect(
                            mmToPx(internalX - requiredDistance),
                            mmToPx(infiniteTop),
                            mmToPx(requiredDistance),
                            mmToPx(infiniteBottom - infiniteTop)
                        );
                    }
                }
            });
        }

        // Check if wall is in restricted zone
        const restriction = sim.isWallInRestrictedZone(tempWall);
        const isRestricted = restriction.restricted;

        // Draw the preview wall
        {
            const segment = tempWall;
            const external = segment.getExternalFacePoints();

            ctx.fillStyle = isRestricted ? 'rgba(244, 67, 54, 0.2)' : 'rgba(76, 175, 80, 0.2)';
            ctx.strokeStyle = isRestricted ? '#f44336' : '#4CAF50';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.moveTo(mmToPx(segment.pointA.x), mmToPx(segment.pointA.y));
            ctx.lineTo(mmToPx(segment.pointB.x), mmToPx(segment.pointB.y));
            ctx.lineTo(mmToPx(external.b.x), mmToPx(external.b.y));
            ctx.lineTo(mmToPx(external.a.x), mmToPx(external.a.y));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = '#2196F3';
            ctx.lineWidth = 4;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(mmToPx(segment.pointA.x), mmToPx(segment.pointA.y));
            ctx.lineTo(mmToPx(segment.pointB.x), mmToPx(segment.pointB.y));
            ctx.stroke();

            ctx.strokeStyle = isRestricted ? '#f44336' : '#4CAF50';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(mmToPx(external.a.x), mmToPx(external.a.y));
            ctx.lineTo(mmToPx(external.b.x), mmToPx(external.b.y));
            ctx.stroke();
            ctx.setLineDash([]);

            const columnSize = mmToPx(COLUMN_SIZE);
            ctx.fillStyle = isRestricted ? 'rgba(244, 67, 54, 0.5)' : 'rgba(76, 175, 80, 0.5)';

            const colAX = segment.pointA.x + (COLUMN_SIZE / 2) * segment.dNorm.x + (COLUMN_SIZE / 2) * segment.n.x;
            const colAY = segment.pointA.y + (COLUMN_SIZE / 2) * segment.dNorm.y + (COLUMN_SIZE / 2) * segment.n.y;
            ctx.fillRect(
                mmToPx(colAX) - columnSize / 2,
                mmToPx(colAY) - columnSize / 2,
                columnSize,
                columnSize
            );

            const colBX = segment.pointB.x - (COLUMN_SIZE / 2) * segment.dNorm.x + (COLUMN_SIZE / 2) * segment.n.x;
            const colBY = segment.pointB.y - (COLUMN_SIZE / 2) * segment.dNorm.y + (COLUMN_SIZE / 2) * segment.n.y;
            ctx.fillRect(
                mmToPx(colBX) - columnSize / 2,
                mmToPx(colBY) - columnSize / 2,
                columnSize,
                columnSize
            );
        }

        // Draw start and end points
        ctx.fillStyle = isRestricted ? '#f44336' : '#4CAF50';
        ctx.beginPath();
        ctx.arc(mmToPx(drawingWall.x), mmToPx(drawingWall.y), 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(mmToPx(tempPoint.x), mmToPx(tempPoint.y), 6, 0, Math.PI * 2);
        ctx.fill();

        // Notify interaction layer about drawing toast update
        if (_interactionState.updateDrawingToast) {
            _interactionState.updateDrawingToast(isRestricted, restriction, tempWall.length);
        }
    }

    // Show starting point when first click is placed but no preview yet
    if (drawingWall && (!tempPoint || (drawingWall.x === tempPoint.x && drawingWall.y === tempPoint.y))) {
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.arc(mmToPx(drawingWall.x), mmToPx(drawingWall.y), 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mmToPx(drawingWall.x), mmToPx(drawingWall.y), 12, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Draw void preview
    if (state.currentMode === 'void' && drawingVoid && tempPoint) {
        const previewX = Math.min(drawingVoid.startX, tempPoint.x);
        const previewY = Math.min(drawingVoid.startY, tempPoint.y);
        const previewW = Math.abs(tempPoint.x - drawingVoid.startX);
        const previewH = Math.abs(tempPoint.y - drawingVoid.startY);
        const tooSmall = previewW < MIN_VOID_SIZE || previewH < MIN_VOID_SIZE;
        const overlaps = state.voids.some(v =>
            v.floorId === state.currentFloorId &&
            previewX < v.x + v.width && previewX + previewW > v.x &&
            previewY < v.y + v.height && previewY + previewH > v.y
        );
        const isInvalid = tooSmall || overlaps;
        ctx.save();
        const px = mmToPx(previewX);
        const py = mmToPx(previewY);
        const pw = mmToPx(previewW);
        const ph = mmToPx(previewH);
        ctx.fillStyle = isInvalid ? 'rgba(220, 38, 38, 0.1)' : 'rgba(34, 197, 94, 0.1)';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = isInvalid ? 'rgba(220, 38, 38, 0.6)' : 'rgba(34, 197, 94, 0.6)';
        ctx.lineWidth = 1.5 / zoomLevel;
        ctx.setLineDash([6 / zoomLevel, 3 / zoomLevel]);
        ctx.strokeRect(px, py, pw, ph);
        ctx.restore();
        if (previewW > 0 && previewH > 0) {
            ctx.fillStyle = isInvalid ? '#dc2626' : '#16a34a';
            ctx.font = `${11 / zoomLevel}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(
                `${Math.round(previewW / 10)}cm x ${Math.round(previewH / 10)}cm`,
                px + pw / 2, py + ph / 2
            );
        }
    }

    // Show snap indicator when hovering and ready to start drawing
    if (currentMousePos && state.currentMode === 'draw' && !drawingWall) {
        drawSnapIndicator(currentMousePos.x, currentMousePos.y);
    }

    // Detect hover for tooltips and pulsing
    let hoveredWallWithErrors = null;
    let tooltipData = null;

    if (currentMousePos && state.currentMode !== 'draw') {
        let hoveredWall = null;
        let hoveredWallIndex = null;

        state.walls.forEach((wall, idx) => {
            if (Math.abs(wall.floorId - state.currentFloorId) > 1) return;

            const external = wall.getExternalFacePoints();
            ctx.beginPath();
            ctx.moveTo(mmToPx(wall.pointA.x), mmToPx(wall.pointA.y));
            ctx.lineTo(mmToPx(wall.pointB.x), mmToPx(wall.pointB.y));
            ctx.lineTo(mmToPx(external.b.x), mmToPx(external.b.y));
            ctx.lineTo(mmToPx(external.a.x), mmToPx(external.a.y));
            ctx.closePath();

            if (ctx.isPointInPath(mmToPx(currentMousePos.x), mmToPx(currentMousePos.y))) {
                hoveredWall = wall;
                hoveredWallIndex = idx;
            }
        });

        if (hoveredWall && hoveredWallIndex !== null && currentMouseScreenPos) {
            const violations = wallViolations.get(hoveredWallIndex) || sim.validateWall(hoveredWall, hoveredWallIndex);
            const errors = violations.filter(v => v.type === 'error');

            if (errors.length > 0) {
                errors.forEach(error => {
                    if (error.conflictingWallIndex !== undefined) {
                        restrictingWalls.add(error.conflictingWallIndex);
                    }
                });

                const tooltipLines = errors.map(e => e.message || String(e)).filter(msg => msg);
                if (tooltipLines.length > 0) {
                    tooltipData = {
                        lines: tooltipLines,
                        mouseX: currentMouseScreenPos.x,
                        mouseY: currentMouseScreenPos.y
                    };
                }
            }
        }
    }

    // Draw pulsing red overlay on walls generating restriction zones
    if (restrictingWalls.size > 0) {
        const time = Date.now() / 1000;
        const pulseOpacity = 0.45 + Math.sin(time * 3) * 0.15;

        ctx.globalAlpha = pulseOpacity;
        ctx.fillStyle = '#ef4444';

        restrictingWalls.forEach(wallIdx => {
            const wall = state.walls[wallIdx];
            if (!wall) return;

            if (Math.abs(wall.floorId - state.currentFloorId) > 1) return;

            const external = wall.getExternalFacePoints();

            ctx.beginPath();
            ctx.moveTo(mmToPx(wall.pointA.x), mmToPx(wall.pointA.y));
            ctx.lineTo(mmToPx(wall.pointB.x), mmToPx(wall.pointB.y));
            ctx.lineTo(mmToPx(external.b.x), mmToPx(external.b.y));
            ctx.lineTo(mmToPx(external.a.x), mmToPx(external.a.y));
            ctx.closePath();
            ctx.fill();
        });

        ctx.globalAlpha = 1.0;

        requestAnimationFrame(() => renderer2D.draw());
    }

    // Render tooltip at the very end
    if (tooltipData) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1.0;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.setLineDash([]);

        const padding = 16;
        const lineHeight = 20;
        const fontSize = 14;

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

        const widths = tooltipData.lines.map(line => ctx.measureText(line).width);
        const maxWidth = Math.max(...widths);
        const tooltipWidth = Math.ceil(maxWidth) + padding * 2;
        const tooltipHeight = tooltipData.lines.length * lineHeight + padding * 2 - 4;

        let tooltipX = tooltipData.mouseX + 15;
        let tooltipY = tooltipData.mouseY + 15;

        if (tooltipX + tooltipWidth > canvas.width) {
            tooltipX = tooltipData.mouseX - tooltipWidth - 15;
        }
        if (tooltipY + tooltipHeight > canvas.height) {
            tooltipY = tooltipData.mouseY - tooltipHeight - 15;
        }

        ctx.fillStyle = 'rgba(244, 67, 54, 0.95)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;

        const radius = 6;
        ctx.beginPath();
        ctx.moveTo(tooltipX + radius, tooltipY);
        ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY);
        ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth, tooltipY + radius);
        ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - radius);
        ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight, tooltipX + tooltipWidth - radius, tooltipY + tooltipHeight);
        ctx.lineTo(tooltipX + radius, tooltipY + tooltipHeight);
        ctx.quadraticCurveTo(tooltipX, tooltipY + tooltipHeight, tooltipX, tooltipY + tooltipHeight - radius);
        ctx.lineTo(tooltipX, tooltipY + radius);
        ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + radius, tooltipY);
        ctx.closePath();
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        tooltipData.lines.forEach((line, i) => {
            ctx.fillText(line, tooltipX + padding, tooltipY + padding + i * lineHeight);
        });

        ctx.restore();
    }
}

// ============================================================
// Navigation handlers (wheel zoom, middle-click pan)
// ============================================================
let _wheelHandler = null;
let _navMouseDownHandler = null;
let _navMouseMoveHandler = null;
let _navMouseUpHandler = null;

function _onWheel(e) {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05;
    const newZoom = Math.max(0.5, Math.min(2, zoomLevel * zoomFactor));

    const worldXBefore = (mouseX - panOffset.x) / zoomLevel;
    const worldYBefore = (mouseY - panOffset.y) / zoomLevel;

    zoomLevel = newZoom;

    panOffset.x = mouseX - worldXBefore * zoomLevel;
    panOffset.y = mouseY - worldYBefore * zoomLevel;

    renderer2D.draw();
}

// ============================================================
// Public API
// ============================================================
export const renderer2D = {
    init(container) {
        canvas = container.querySelector('canvas') || container.querySelector('#mainCanvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            container.appendChild(canvas);
        }
        ctx = canvas.getContext('2d');
    },

    draw: draw,

    activate() {
        if (canvas && canvas.parentElement) {
            canvas.parentElement.style.display = '';
        }
        window.addEventListener('resize', this._onResize);
        this._onResize();
        this._bindNavigation();
    },

    deactivate() {
        if (canvas && canvas.parentElement) {
            canvas.parentElement.style.display = 'none';
        }
        window.removeEventListener('resize', this._onResize);
        this._unbindNavigation();
    },

    screenToWorld(event) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;
        const worldX = (canvasX - panOffset.x) / zoomLevel;
        const worldY = (canvasY - panOffset.y) / zoomLevel;
        let x = pxToMm(worldX);
        let y = pxToMm(worldY);
        x = sim.snapToGrid(x, GRID_SIZE_EXTERNAL);
        y = sim.snapToGrid(y, GRID_SIZE_EXTERNAL);
        return { x, y, screenX: canvasX, screenY: canvasY };
    },

    getCanvas() { return canvas; },
    get panOffset() { return panOffset; },
    get zoomLevel() { return zoomLevel; },
    get isPanning() { return isPanning; },
    set isPanning(val) { isPanning = val; },

    setInteractionState(istate) { _interactionState = istate; },

    _onResize() {
        if (!canvas) return;
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        if (canvas.width > 0 && canvas.height > 0) {
            renderer2D.draw();
        }
    },

    _bindNavigation() {
        if (!canvas) return;
        canvas.addEventListener('wheel', _onWheel, { passive: false });
    },

    _unbindNavigation() {
        if (!canvas) return;
        canvas.removeEventListener('wheel', _onWheel);
    },
};
