# Symmetry Line Simulator

A web-based application for simulating and validating wall placement according to the 300mm grid strategy and structural rules.

## Features

### Core Functionality
- **Interactive Wall Drawing**: Click-and-drag interface for drawing walls on a canvas
- **300mm Grid System**: Primary 300mm grid with 100mm subdivisions for precise placement
- **Automatic Grid Snapping**: All walls snap to 300mm grid lines
- **Horizontal/Vertical Constraints**: Walls can only be drawn horizontally or vertically

### Wall Properties
- **Internal Face (Blue Line)**: Grid-aligned face where steel columns are located
- **External Face**: Opposite side of the wall, showing full wall thickness
- **Steel Columns**: 100x100mm columns displayed at wall endpoints
- **Configurable Thickness**: Adjustable wall thickness (default: 200mm)
- **Auto-Segmentation**: Walls longer than 6000mm are automatically split into segments

### Validation & Restrictions
- **Minimum Length**: 400mm
- **Maximum Length**: 6000mm (auto-splits longer walls)
- **Restricted Zones**: Visual indicators showing:
  - Orange zones: 600mm minimum distance for parallel walls (same orientation)
  - Red zones: 1200mm minimum distance for opposite-facing walls
- **Real-time Validation**: Automatic checking of:
  - Wall length constraints
  - Overlap detection
  - Orientation and thickness matching for aligned walls
  - Minimum distance requirements

### Multi-Floor Support
- **Floor Management**: Add, remove, and switch between multiple floors
- **Adjacent Floor Visualization**: See walls from floors above/below with different opacity
- **Floor-Specific Validation**: Rules applied per floor and across adjacent floors

### User Interface
- **Mode Selection**: Draw, Select/Move, and Delete modes
- **Visual Feedback**: 
  - Green preview for valid placements
  - Red preview for restricted zones
  - Violation indicators on invalid walls
- **Information Panel**: Real-time display of:
  - Current mouse position
  - Grid size
  - Floor information
  - Selected wall details
- **Validation Results**: Detailed list of any rule violations

## Technical Details

### Constants
- `GRID_SIZE_EXTERNAL`: 300mm (primary grid)
- `GRID_SIZE_INTERNAL`: 100mm (subdivision grid)
- `COLUMN_SIZE`: 100mm (steel column dimensions)
- `MIN_WALL_LENGTH`: 400mm
- `MAX_WALL_LENGTH`: 6000mm
- `MIN_DISTANCE_PARALLEL`: 600mm (same orientation)
- `MIN_DISTANCE_OPPOSITE`: 1200mm (opposite orientation)
- `MM_TO_PX`: 0.15 (scale factor for visualization)

### Wall Model
- **Points A and B**: Represent the internal face (blue line, grid-aligned)
- **Normal Vector**: Points inward from external face
- **Direction Vector**: Along the wall length
- **Thickness**: Extends outward from internal face via normal vector

### Validation Rules
1. **Same Floor - Aligned Walls**: Cannot overlap, must share orientation and thickness
2. **Same Floor - Parallel Walls**: Minimum 600mm distance (same orientation) or 1200mm (opposite orientation)
3. **Perpendicular Walls**: No minimum distance requirement
4. **Auto-Split Segments**: Share a `groupId` to prevent self-validation

## Usage

1. **Drawing Walls**:
   - Click "Draw Wall" button
   - Click once for start point
   - Move horizontally or vertically
   - Click again for end point

2. **Selecting/Moving Walls**:
   - Click "Select / Move" button
   - Click on a wall to select it
   - View and modify properties in the sidebar

3. **Managing Floors**:
   - Use floor dropdown to switch between floors
   - Click "Add Floor Above" to create new floor
   - Click "Remove Current Floor" to delete (with confirmation)

4. **Viewing Options**:
   - Toggle "Show Grid" to display/hide the grid
   - Toggle "Show Restricted Zones" to display/hide distance restrictions
   - Toggle "Show Adjacent Floors" to display/hide walls from other floors

5. **Validation**:
   - Click "Validate Rules" to check all walls
   - Violations appear in the sidebar with detailed messages
   - Invalid walls are highlighted in red on the canvas

## Files

- `index.html`: Main application file (complete standalone web app)
- `rules.txt`: Extracted text version of the rules

## Browser Compatibility

Works in all modern browsers with HTML5 Canvas support:
- Chrome/Edge (recommended)
- Firefox
- Safari

## Development

This is a pure HTML/CSS/JavaScript application with no external dependencies. Simply open `index.html` in a web browser to run.

## License

[Add your license here]

## Author

[Add your information here]
