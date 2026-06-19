# Exploded Step Map: HYROX Race Lab Analytical Improvements

This plan decomposes the implementation of four analytical features into atomic, verifiable steps.

## Phase 1: Chart & Header Analytics

### Step 1.1: Run Decay % Calculation & Display
- **Task**: Calculate the fatigue index for each race and display it in the running splits chart legend.
- **Action**:
    - Modify `js/charts.js` -> `buildRunsLegend` to calculate `decayPercent = ((r.runs[7] - r.runs[0]) / r.runs[0]) * 100`.
    - Append the formatted decay (e.g., `+4.2%`) to the legend text.
- **Dependency**: None.
- **Acceptance Criteria**: Legend below the "Running Splits" chart shows a percentage value next to each athlete's name indicating their pace decay from Run 1 to Run 8.

### Step 1.2: Aerobic/Power Balance Ratio (A/P Ratio)
- **Task**: Calculate the ratio of Running Total to Workout Total and display it in the header summary cards.
- **Action**:
    - Modify `css/styles.css` -> `.rc .mini-grid` to use `grid-template-columns: repeat(4, 1fr)`.
    - Modify `js/app.js` -> `buildHeader` to calculate `ratio = r.runsSecs / r.workoutsSecs`.
    - Add a 4th `.mini-stat` column to the `.mini-grid` with label "A/P Ratio" and value formatted to 2 decimals.
- **Dependency**: None.
- **Acceptance Criteria**: Each race card in the header displays an "A/P Ratio" stat (typically between 0.9 and 1.1).

## Phase 2: Table Analytics & Icons

### Step 2.1: Relative Pace Heatmap Implementation
- **Task**: Apply a colorscale to table cells based on their performance relative to the segment average.
- **Action**:
    - Modify `js/table.js` -> `renderTable`.
    - For each row, calculate the `median` or `mean` of visible values.
    - For each cell value `v`, calculate `diffPercent = (v / mean)`.
    - Map `diffPercent` to an RGBA background color (e.g., green for < 100%, red for > 100%).
    - Update `<td>` generation to include this `background-color` inline style.
- **Dependency**: None.
- **Acceptance Criteria**: The split times table cells have background colors that highlight relatively fast (green) and slow (red) segments per row.

### Step 2.2: Best/Worst Station Icons
- **Task**: Add visual indicators for the fastest and slowest segments in the table.
- **Action**:
    - Modify `js/table.js` -> `renderTable`.
    - Prepend `🏆 ` to the content of cells with the `best` class.
    - Prepend `⚠️ ` to the content of cells with the `worst` class.
    - Add CSS styles to `css/styles.css` to ensure icons don't break cell alignment.
- **Dependency**: Step 2.1 (logic for best/worst exists, but icon addition is a distinct UI step).
- **Acceptance Criteria**: The fastest segment in each row displays a trophy icon, and the slowest displays a warning icon.
