// renderer3d.js — Three.js 3D renderer for the Symmetry Line Simulator
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as sim from './sim.js';
import { state } from './sim.js';

const {
    GRID_SIZE_EXTERNAL, GRID_SIZE_INTERNAL, COLUMN_SIZE, VOID_GRID,
    MIN_DISTANCE_PARALLEL, MIN_DISTANCE_OPPOSITE
} = sim;

// ============================================================
// Unit conversion: 1 Three.js unit = 100mm
// ============================================================
const MM_TO_UNITS = 0.01;
const FLOOR_HEIGHT_UNITS = 2700 * MM_TO_UNITS; // 27 units
const SLAB_THICKNESS = 350 * MM_TO_UNITS; // 3.5 units

function mmToUnits(mm) { return mm * MM_TO_UNITS; }
function unitsToMm(u) { return u / MM_TO_UNITS; }

// ============================================================
// Three.js state
// ============================================================
let container = null;
let scene = null;
let camera = null;
let rendererGL = null;
let controls = null;
let animFrameId = null;
let isActive = false;

// Groups for easy clearing
let wallGroup = null;
let voidGroup = null;
let envelopeGroup = null;
let previewGroup = null;
let gridGroup = null;
let ghostGroup = null;
let zoneGroup = null;

// Snap cursor
let cursorMesh = null;

// Raycasting
let groundPlane = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Interaction state bridge
let _interactionState = {};

// ============================================================
// Materials (reused across draws)
// ============================================================
const materials = {};

function initMaterials() {
    materials.wallDefault = new THREE.MeshStandardMaterial({
        color: 0x6b7280,
        roughness: 0.6,
        metalness: 0.1,
    });
    materials.wallSelected = new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        roughness: 0.5,
        metalness: 0.15,
    });
    materials.wallViolation = new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        roughness: 0.6,
        metalness: 0.1,
    });
    materials.wallGhost = new THREE.MeshStandardMaterial({
        color: 0x9ca3af,
        transparent: true,
        opacity: 0.25,
        roughness: 0.7,
        metalness: 0,
    });
    materials.column = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.4,
        metalness: 0.3,
    });
    materials.voidDefault = new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
    });
    materials.voidWireframe = new THREE.MeshBasicMaterial({
        color: 0xdc2626,
        wireframe: true,
        transparent: true,
        opacity: 0.5,
    });
    materials.voidSelected = new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
    });
    materials.voidGhost = new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
    });
    materials.envelope = new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
    });
    materials.slab = new THREE.MeshStandardMaterial({
        color: 0xd1d5db, // Tailwind Gray-300
        transparent: true,
        opacity: 0.7,
        roughness: 0.8,
        metalness: 0,
        side: THREE.DoubleSide,
    });
    materials.slabGhost = new THREE.MeshStandardMaterial({
        color: 0xd1d5db,
        transparent: true,
        opacity: 0.3,
        roughness: 0.8,
        metalness: 0,
        side: THREE.DoubleSide,
    });
    materials.previewWall = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.45,
        roughness: 0.7,
        metalness: 0,
    });
    materials.previewVoid = new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
    });
    materials.previewVoidInvalid = new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
    });
}

// ============================================================
// Scene setup
// ============================================================
function setupScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);

    // Camera
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
    camera.position.set(30, 40, 30);
    camera.lookAt(0, 0, 0);

    // Renderer
    rendererGL = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
    });
    rendererGL.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererGL.shadowMap.enabled = true;
    rendererGL.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererGL.toneMapping = THREE.ACESFilmicToneMapping;
    rendererGL.toneMappingExposure = 1.0;
    container.appendChild(rendererGL.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 80, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 300;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);

    // A subtle hemisphere light for fill
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x9ca3af, 0.3);
    scene.add(hemiLight);

    // OrbitControls
    controls = new OrbitControls(camera, rendererGL.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    // LEFT = null (we handle clicks via interaction.js)
    // MIDDLE = PAN, RIGHT = ROTATE
    controls.mouseButtons = {
        LEFT: null,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.target.set(0, 0, 0);
    controls.update();

    // Groups
    gridGroup = new THREE.Group();
    scene.add(gridGroup);
    envelopeGroup = new THREE.Group();
    scene.add(envelopeGroup);
    zoneGroup = new THREE.Group();
    scene.add(zoneGroup);
    ghostGroup = new THREE.Group();
    scene.add(ghostGroup);
    wallGroup = new THREE.Group();
    scene.add(wallGroup);
    voidGroup = new THREE.Group();
    scene.add(voidGroup);
    previewGroup = new THREE.Group();
    scene.add(previewGroup);

    // Snap cursor indicator
    const cursorGeo = new THREE.RingGeometry(0.1, 0.15, 16);
    const cursorMat = new THREE.MeshBasicMaterial({ color: 0x2563eb, side: THREE.DoubleSide });
    cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
    cursorMesh.rotation.x = -Math.PI / 2;
    cursorMesh.visible = false;
    scene.add(cursorMesh);

    // Invisible ground plane for raycasting
    const planeGeo = new THREE.PlaneGeometry(10000, 10000);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false });
    groundPlane = new THREE.Mesh(planeGeo, planeMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = 0;
    scene.add(groundPlane);

    initMaterials();
}

// ============================================================
// Grid
// ============================================================
function buildGrid() {
    // Clear existing
    while (gridGroup.children.length > 0) {
        const child = gridGroup.children[0];
        gridGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    }

    const floorY = getFloorY(state.currentFloorId);
    const gridExtent = 150; // units (= 15000mm = 15m each direction)

    // 300mm major grid
    const majorStep = mmToUnits(GRID_SIZE_EXTERNAL); // 3 units
    const majorGrid = new THREE.GridHelper(
        gridExtent * 2,                      // size
        Math.round((gridExtent * 2) / majorStep), // divisions
        0x999999,                             // center line color
        0x999999                              // grid color
    );
    majorGrid.position.y = floorY + 0.001;
    majorGrid.material.transparent = true;
    majorGrid.material.opacity = 0.4;
    gridGroup.add(majorGrid);

    // 100mm minor grid
    const minorStep = mmToUnits(GRID_SIZE_INTERNAL); // 1 unit
    const minorGrid = new THREE.GridHelper(
        gridExtent * 2,
        Math.round((gridExtent * 2) / minorStep),
        0xdddddd,
        0xdddddd
    );
    minorGrid.position.y = floorY + 0.0005;
    minorGrid.material.transparent = true;
    minorGrid.material.opacity = 0.2;
    gridGroup.add(minorGrid);
}

// ============================================================
// Floor height helper
// ============================================================
function getFloorY(floorId) {
    return floorId * FLOOR_HEIGHT_UNITS;
}

// ============================================================
// Wall rendering
// ============================================================
function buildWalls() {
    clearGroup(wallGroup);
    clearGroup(ghostGroup);

    // Get violations for current floor walls
    const wallViolations = new Map();
    state.walls.forEach((wall, idx) => {
        if (wall.floorId === state.currentFloorId ||
            wall.floorId === state.currentFloorId - 1 ||
            wall.floorId === state.currentFloorId + 1) {
            wallViolations.set(idx, sim.validateWall(wall, idx));
        }
    });

    // Ghost walls below
    if (state.showLevelsBelow) {
        state.walls.forEach((wall, idx) => {
            if (wall.floorId < state.currentFloorId) {
                buildWallMesh(wall, ghostGroup, materials.wallGhost, idx, wallViolations);
            }
        });
    }

    // Ghost walls above
    if (state.showLevelsAbove) {
        state.walls.forEach((wall, idx) => {
            if (wall.floorId > state.currentFloorId) {
                const mat = materials.wallGhost.clone();
                mat.opacity = 0.12;
                buildWallMesh(wall, ghostGroup, mat, idx, wallViolations);
            }
        });
    }

    // Current floor walls
    state.walls.forEach((wall, idx) => {
        if (wall.floorId === state.currentFloorId) {
            const isSelected = state.selectedWalls.includes(wall);
            const violations = wallViolations.get(idx) || [];
            const hasViolation = violations.some(v => v.type === 'error');

            let mat;
            if (isSelected) {
                mat = materials.wallSelected;
            } else if (hasViolation) {
                mat = materials.wallViolation;
            } else {
                mat = materials.wallDefault;
            }

            buildWallMesh(wall, wallGroup, mat, idx, wallViolations);

            // Endpoint handles for selected walls
            if (isSelected) {
                const floorY = getFloorY(wall.floorId);
                const wallHeight = mmToUnits(wall.height);
                const handleGeo = new THREE.SphereGeometry(mmToUnits(80), 8, 8);
                const handleMat = new THREE.MeshBasicMaterial({ color: 0x2563eb });

                const handleA = new THREE.Mesh(handleGeo, handleMat);
                handleA.position.set(
                    mmToUnits(wall.pointA.x),
                    floorY + wallHeight / 2,
                    mmToUnits(wall.pointA.y)
                );
                wallGroup.add(handleA);

                const handleB = new THREE.Mesh(handleGeo, handleMat);
                handleB.position.set(
                    mmToUnits(wall.pointB.x),
                    floorY + wallHeight / 2,
                    mmToUnits(wall.pointB.y)
                );
                wallGroup.add(handleB);
            }
        }
    });
}

function buildWallMesh(wall, group, material, idx, wallViolations) {
    const floorY = getFloorY(wall.floorId);

    // Wall dimensions in Three.js units
    const wallLength = mmToUnits(wall.length);
    const wallHeight = mmToUnits(wall.height);
    const wallThickness = mmToUnits(wall.thickness);

    if (wallLength <= 0) return;

    // Create box geometry: X=thickness, Y=height, Z=length
    const geo = new THREE.BoxGeometry(wallThickness, wallHeight, wallLength);

    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Calculate midpoint of internal face (A-B line)
    const midX = mmToUnits((wall.pointA.x + wall.pointB.x) / 2);
    const midZ = mmToUnits((wall.pointA.y + wall.pointB.y) / 2);

    // Offset by half thickness in normal direction (A/B are on internal face)
    const offsetX = mmToUnits(wall.n.x * wall.thickness / 2);
    const offsetZ = mmToUnits(wall.n.y * wall.thickness / 2);

    // Position: sim Y -> Three.js Z, elevation -> Three.js Y
    mesh.position.set(
        midX + offsetX,
        floorY + wallHeight / 2,
        midZ + offsetZ
    );

    // Rotation: atan2(wall.d.x, wall.d.y) maps sim direction to Three.js Y rotation
    mesh.rotation.y = Math.atan2(wall.d.x, wall.d.y);

    group.add(mesh);

    // Steel columns at endpoints
    const colSize = mmToUnits(COLUMN_SIZE);
    const colGeo = new THREE.BoxGeometry(colSize, wallHeight + 0.02, colSize);

    const colA = new THREE.Mesh(colGeo, materials.column);
    colA.position.set(
        mmToUnits(wall.pointA.x),
        floorY + wallHeight / 2,
        mmToUnits(wall.pointA.y)
    );
    colA.castShadow = true;
    group.add(colA);

    const colB = new THREE.Mesh(colGeo, materials.column);
    colB.position.set(
        mmToUnits(wall.pointB.x),
        floorY + wallHeight / 2,
        mmToUnits(wall.pointB.y)
    );
    colB.castShadow = true;
    group.add(colB);
}

// ============================================================
// Void rendering
// ============================================================
function buildVoids() {
    clearGroup(voidGroup);

    // Ghost voids
    if (state.showLevelsBelow || state.showLevelsAbove) {
        state.voids.forEach(v => {
            if (v.floorId !== state.currentFloorId) {
                const floorDiff = Math.abs(v.floorId - state.currentFloorId);
                if (floorDiff <= 3) {
                    buildVoidMesh(v, materials.voidGhost);
                }
            }
        });
    }

    // Current floor voids
    state.voids.forEach(v => {
        if (v.floorId === state.currentFloorId) {
            const isSelected = state.selectedVoid === v;
            buildVoidMesh(v, isSelected ? materials.voidSelected : materials.voidDefault);

            // Resize handles for selected void (8 points: corners + edge midpoints)
            if (isSelected) {
                const floorY = getFloorY(v.floorId);
                const handleGeo = new THREE.SphereGeometry(mmToUnits(60), 8, 8);
                const handleMat = new THREE.MeshBasicMaterial({ color: 0x2563eb });
                const handles = [
                    [v.x, v.y],
                    [v.x + v.width / 2, v.y],
                    [v.x + v.width, v.y],
                    [v.x + v.width, v.y + v.height / 2],
                    [v.x + v.width, v.y + v.height],
                    [v.x + v.width / 2, v.y + v.height],
                    [v.x, v.y + v.height],
                    [v.x, v.y + v.height / 2],
                ];
                handles.forEach(([hx, hy]) => {
                    const sphere = new THREE.Mesh(handleGeo, handleMat);
                    sphere.position.set(mmToUnits(hx), floorY + 0.05, mmToUnits(hy));
                    voidGroup.add(sphere);
                });
            }
        }
    });
}

function buildVoidMesh(v, material) {
    const floorY = getFloorY(v.floorId);
    const w = mmToUnits(v.width);
    const h = mmToUnits(v.height);

    const geo = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(
        mmToUnits(v.x) + w / 2,
        floorY + 0.01,
        mmToUnits(v.y) + h / 2
    );
    voidGroup.add(mesh);

    // Wireframe border
    const wireGeo = new THREE.PlaneGeometry(w, h);
    const wireMesh = new THREE.Mesh(wireGeo, materials.voidWireframe);
    wireMesh.rotation.x = -Math.PI / 2;
    wireMesh.position.set(
        mmToUnits(v.x) + w / 2,
        floorY + 0.015,
        mmToUnits(v.y) + h / 2
    );
    voidGroup.add(wireMesh);
}

// ============================================================
// Envelope rendering (extruded slabs)
// ============================================================
function buildEnvelopes() {
    clearGroup(envelopeGroup);

    state.buildingEnvelopes.forEach(env => {
        if (!env.polygon || env.polygon.length < 3) return;

        const isCurrent = env.floorId === state.currentFloorId;
        const isBelow = env.floorId < state.currentFloorId && state.showLevelsBelow;
        const isAbove = env.floorId > state.currentFloorId && state.showLevelsAbove;

        if (!isCurrent && !isBelow && !isAbove) return;

        const floorY = getFloorY(env.floorId);
        const mat = isCurrent ? materials.slab : materials.slabGhost;

        // Build a THREE.Shape from the envelope polygon
        const shape = new THREE.Shape();
        const p0 = env.polygon[0];
        shape.moveTo(mmToUnits(p0.x), mmToUnits(p0.y));
        for (let i = 1; i < env.polygon.length; i++) {
            const p = env.polygon[i];
            shape.lineTo(mmToUnits(p.x), mmToUnits(p.y));
        }
        shape.closePath();

        // Build slab geometry directly in world space to avoid rotation offset issues.
        // Create top and bottom faces from the polygon, then connect them.
        const pts = env.polygon.map(p => ({
            x: mmToUnits(p.x),
            z: mmToUnits(p.y) // sim Y → Three.js Z
        }));
        const n = pts.length;

        function makeSlabGeo(yBottom, yTop) {
            // Two faces (top + bottom) + side faces
            const positions = [];
            const indices = [];

            // Bottom face vertices: 0..n-1
            for (let i = 0; i < n; i++) {
                positions.push(pts[i].x, yBottom, pts[i].z);
            }
            // Top face vertices: n..2n-1
            for (let i = 0; i < n; i++) {
                positions.push(pts[i].x, yTop, pts[i].z);
            }

            // Triangulate top and bottom faces (fan from vertex 0)
            for (let i = 1; i < n - 1; i++) {
                // Bottom face (winding order for downward normal)
                indices.push(0, i + 1, i);
                // Top face (winding order for upward normal)
                indices.push(n, n + i, n + i + 1);
            }

            // Side faces
            for (let i = 0; i < n; i++) {
                const i2 = (i + 1) % n;
                // Two triangles per side quad
                indices.push(i, i2, n + i2);
                indices.push(i, n + i2, n + i);
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geo.setIndex(indices);
            geo.computeVertexNormals();
            return geo;
        }

        // Floor slab: bottom of walls (floorY - SLAB_THICKNESS to floorY)
        const floorSlabGeo = makeSlabGeo(floorY - SLAB_THICKNESS, floorY);
        const floorSlabMesh = new THREE.Mesh(floorSlabGeo, mat);
        floorSlabMesh.castShadow = true;
        floorSlabMesh.receiveShadow = true;
        envelopeGroup.add(floorSlabMesh);

        // Roof slab: top of walls (floorY + wallHeight to floorY + wallHeight + SLAB_THICKNESS)
        const roofSlabGeo = makeSlabGeo(floorY + FLOOR_HEIGHT_UNITS, floorY + FLOOR_HEIGHT_UNITS + SLAB_THICKNESS);
        const roofSlabMesh = new THREE.Mesh(roofSlabGeo, mat);
        envelopeGroup.add(roofSlabMesh);
    });
}

// ============================================================
// Restricted zones (void mode + draw mode)
// ============================================================

/**
 * Build a single zone plane for a wall face.
 * @param {Wall} wall - The wall object
 * @param {number} faceOffset - Distance from internal face (0 = internal, thickness = external)
 * @param {number} normalDir - Direction multiplier for normal (+1 outward, -1 inward)
 * @param {number} zoneDepth - How far the zone extends from the face (mm)
 * @param {number} color - Hex color
 * @param {number} opacity - Opacity value
 * @param {number} floorY - Y position in 3D units
 */
function buildZonePlane(wall, faceOffset, normalDir, zoneDepth, color, opacity, floorY) {
    if (wall.length <= 0) return;

    // Face corners in mm
    const ax = wall.pointA.x + wall.n.x * faceOffset;
    const ay = wall.pointA.y + wall.n.y * faceOffset;
    const bx = wall.pointB.x + wall.n.x * faceOffset;
    const by = wall.pointB.y + wall.n.y * faceOffset;

    // Outward normal (in zone extension direction)
    const nx = wall.n.x * normalDir;
    const ny = wall.n.y * normalDir;

    // Mid-point of the zone
    const midFaceX = (ax + bx) / 2;
    const midFaceY = (ay + by) / 2;
    const centerX = midFaceX + nx * zoneDepth / 2;
    const centerY = midFaceY + ny * zoneDepth / 2;

    // Build the zone as a flat quad using BufferGeometry to avoid rotation issues
    // Four corners in world space (XZ plane at floorY)
    const halfLen = wall.length / 2;
    const dNormX = wall.dNorm ? wall.dNorm.x : wall.d.x / wall.length;
    const dNormY = wall.dNorm ? wall.dNorm.y : wall.d.y / wall.length;

    // Face midpoint → offset by half zone depth in normal direction
    // Corner positions in mm:
    // c0 = faceA, c1 = faceB, c2 = faceB + normal*depth, c3 = faceA + normal*depth
    const c0x = ax, c0y = ay;
    const c1x = bx, c1y = by;
    const c2x = bx + nx * zoneDepth, c2y = by + ny * zoneDepth;
    const c3x = ax + nx * zoneDepth, c3y = ay + ny * zoneDepth;

    const vertices = new Float32Array([
        mmToUnits(c0x), floorY + 0.005, mmToUnits(c0y),
        mmToUnits(c1x), floorY + 0.005, mmToUnits(c1y),
        mmToUnits(c2x), floorY + 0.005, mmToUnits(c2y),
        mmToUnits(c3x), floorY + 0.005, mmToUnits(c3y),
    ]);
    const indices = [0, 1, 2, 0, 2, 3];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
    });
    const zoneMesh = new THREE.Mesh(geo, mat);

    zoneGroup.add(zoneMesh);
}

function buildZones() {
    clearGroup(zoneGroup);

    // Void-mode zones (purple, VOID_GRID distance)
    if (state.currentMode === 'void') {
        const floorY = getFloorY(state.currentFloorId);
        const floorWalls = state.walls.filter(w => w.floorId === state.currentFloorId);

        floorWalls.forEach(wall => {
            const isInEnvelope = sim.isWallInEnvelope(wall);
            const faceOffset = isInEnvelope ? wall.thickness : 0;
            const dirSign = isInEnvelope ? 1 : -1;

            buildZonePlane(wall, faceOffset, dirSign, VOID_GRID, 0xa855f7, 0.1, floorY);
        });
    }

    // Draw-mode zones (parallel + opposite restriction distances)
    if (state.currentMode === 'draw') {
        const relevantWalls = state.walls.filter(w =>
            w.floorId === state.currentFloorId ||
            Math.abs(w.floorId - state.currentFloorId) === 1
        );

        relevantWalls.forEach(wall => {
            const floorY = getFloorY(wall.floorId);

            // Zone on the column/internal face side (parallel restriction, 600mm) — orange
            buildZonePlane(wall, 0, -1, MIN_DISTANCE_PARALLEL, 0xf59e0b, 0.06, floorY);

            // Zone on the external face side (opposite restriction, 1200mm) — red
            buildZonePlane(wall, wall.thickness, 1, MIN_DISTANCE_OPPOSITE, 0xdc2626, 0.04, floorY);
        });
    }
}

// ============================================================
// Preview rendering
// ============================================================
function buildPreview() {
    clearGroup(previewGroup);

    const drawingWall = _interactionState.drawingWall;
    const tempPoint = _interactionState.tempPoint;
    const wallFlipped = _interactionState.wallFlipped;
    const drawingVoid = _interactionState.drawingVoid;

    if (drawingWall && tempPoint) {
        // Constrain to axis
        const dx = Math.abs(tempPoint.x - drawingWall.x);
        const dy = Math.abs(tempPoint.y - drawingWall.y);
        let endX, endY;
        if (dx > dy) {
            endX = tempPoint.x;
            endY = drawingWall.y;
        } else {
            endX = drawingWall.x;
            endY = tempPoint.y;
        }

        const startX = wallFlipped ? endX : drawingWall.x;
        const startY = wallFlipped ? endY : drawingWall.y;
        const finX = wallFlipped ? drawingWall.x : endX;
        const finY = wallFlipped ? drawingWall.y : endY;

        const wallDx = finX - startX;
        const wallDy = finY - startY;
        const wallLength = Math.sqrt(wallDx * wallDx + wallDy * wallDy);

        if (wallLength > 0) {
            const thickness = parseInt(document.getElementById('wallThickness').value) || 200;
            const height = 2700;
            const floorY = getFloorY(state.currentFloorId);

            const lenU = mmToUnits(wallLength);
            const thkU = mmToUnits(thickness);
            const htU = mmToUnits(height);

            // Check if preview wall would be in a restricted zone
            const previewWall = new sim.Wall(startX, startY, finX, finY, thickness, height, null, state.currentFloorId);
            const restriction = sim.isWallInRestrictedZone(previewWall);
            const isRestricted = restriction && restriction.restricted;
            const previewMat = isRestricted ? materials.previewVoidInvalid : materials.previewWall;

            const geo = new THREE.BoxGeometry(thkU, htU, lenU);
            const mesh = new THREE.Mesh(geo, previewMat);

            // Direction and normal for preview wall
            const dNormX = wallDx / wallLength;
            const dNormY = wallDy / wallLength;
            const nX = -dNormY;
            const nY = dNormX;

            const midX = mmToUnits((startX + finX) / 2);
            const midZ = mmToUnits((startY + finY) / 2);
            const offsetX = mmToUnits(nX * thickness / 2);
            const offsetZ = mmToUnits(nY * thickness / 2);

            mesh.position.set(
                midX + offsetX,
                floorY + htU / 2,
                midZ + offsetZ
            );
            mesh.rotation.y = Math.atan2(wallDx, wallDy);
            previewGroup.add(mesh);
        }
    }

    if (drawingVoid && tempPoint) {
        const floorY = getFloorY(state.currentFloorId);
        const x = Math.min(drawingVoid.startX, tempPoint.x);
        const y = Math.min(drawingVoid.startY, tempPoint.y);
        const w = Math.abs(tempPoint.x - drawingVoid.startX);
        const h = Math.abs(tempPoint.y - drawingVoid.startY);

        if (w > 0 && h > 0) {
            const wU = mmToUnits(w);
            const hU = mmToUnits(h);

            const geo = new THREE.PlaneGeometry(wU, hU);
            const mesh = new THREE.Mesh(geo, materials.previewVoid);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(
                mmToUnits(x) + wU / 2,
                floorY + 0.02,
                mmToUnits(y) + hU / 2
            );
            previewGroup.add(mesh);
        }
    }
}

// ============================================================
// Helpers
// ============================================================
function clearGroup(group) {
    while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child.geometry) child.geometry.dispose();
        // Only dispose cloned materials (not shared ones)
        if (child.material && !Object.values(materials).includes(child.material)) {
            child.material.dispose();
        }
    }
}

// ============================================================
// Animation loop
// ============================================================
function animate() {
    if (!isActive) return;
    animFrameId = requestAnimationFrame(animate);
    controls.update();
    rendererGL.render(scene, camera);
}

// ============================================================
// Full draw from state
// ============================================================
function draw() {
    if (!scene || !rendererGL) return;

    // Update ground plane Y to current floor
    const currentFloorY = getFloorY(state.currentFloorId);
    groundPlane.position.y = currentFloorY;

    buildGrid();
    buildEnvelopes();
    buildZones();
    buildWalls();
    buildVoids();
    buildPreview();

    // Snap cursor
    if (cursorMesh) {
        if (_interactionState.currentMousePos &&
            (state.currentMode === 'draw' || state.currentMode === 'void')) {
            cursorMesh.position.set(
                mmToUnits(_interactionState.currentMousePos.x),
                currentFloorY + 0.02,
                mmToUnits(_interactionState.currentMousePos.y)
            );
            cursorMesh.visible = true;
        } else {
            cursorMesh.visible = false;
        }
    }

    // Render one frame immediately (animation loop will continue)
    if (controls) controls.update();
    rendererGL.render(scene, camera);
}

// ============================================================
// Exported renderer object
// ============================================================
export const renderer3D = {
    init(containerEl) {
        container = containerEl;
        setupScene();
    },

    draw,

    activate() {
        if (container) container.style.display = '';
        isActive = true;
        this._onResize();
        window.addEventListener('resize', this._onResize);
        animate();
    },

    deactivate() {
        isActive = false;
        if (container) container.style.display = 'none';
        window.removeEventListener('resize', this._onResize);
        if (animFrameId !== null) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
    },

    screenToWorld(event) {
        if (!rendererGL || !camera) return null;
        const rect = rendererGL.domElement.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;

        mouse.x = (canvasX / rect.width) * 2 - 1;
        mouse.y = -(canvasY / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(groundPlane);

        if (intersects.length === 0) return null;

        const pt = intersects[0].point;
        // Three.js X -> mm X, Three.js Z -> mm Y
        let x = unitsToMm(pt.x);
        let y = unitsToMm(pt.z);

        x = sim.snapToGrid(x, GRID_SIZE_EXTERNAL);
        y = sim.snapToGrid(y, GRID_SIZE_EXTERNAL);

        return { x, y, screenX: canvasX, screenY: canvasY };
    },

    getCanvas() {
        return rendererGL ? rendererGL.domElement : null;
    },

    get panOffset() { return { x: 0, y: 0 }; },
    get zoomLevel() { return 1; },
    get isPanning() { return false; },
    set isPanning(v) { /* noop — OrbitControls handles navigation */ },

    setInteractionState(istate) { _interactionState = istate; },

    _onResize() {
        if (!container || !rendererGL || !camera) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === 0 || h === 0) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        rendererGL.setSize(w, h);
        if (scene) rendererGL.render(scene, camera);
    },

    _bindNavigation() { /* OrbitControls handles this */ },
    _unbindNavigation() { /* OrbitControls handles this */ },
};
