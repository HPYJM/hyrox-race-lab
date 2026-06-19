# Advanced Analytics & Simulator Plan

## 1. Directory Structure & Logic Separation
To maintain modularity as the app grows, I'll introduce dedicated files for logic while keeping `charts.js` for visualization.

- `js/analytics.js`: **New.** Logic for calculating Station Recovery deltas, Fatigue Index, and other advanced metrics.
- `js/simulator.js`: **New.** State management and calculation for the "What If" interactive pacer.
- `js/charts.js`: **Update.** Add `buildRecoveryChart(races, hidden)` to visualize station-specific fatigue.
- `index.html`: **Update.** Add new sections for visualization and simulator controls.

## 2. UI Placement in index.html

### A. Station Recovery Analysis (⛽)
- **Position**: Immediately after the **Workout Stations** section.
- **Why**: This section bridges the gap between workout intensity and subsequent running capacity.
- **Layout**: A standard `ccard` containing a `canvas` for a bar chart.

### B. "What If" Simulator (🔮)
- **Position**: After the **Split Table** at the bottom of the main content area.
- **Why**: Users usually look at the table first to see actuals, then want to experiment with improvements.
- **Layout**: A specialized interactive card with range sliders for Run %, Workout %, and Roxzone % adjustments.

## 3. Analytical Formulas

### Station Recovery Delta
For each station $k \in \{1 \dots 7\}$:
$$\Delta_{k} = \text{Duration}(\text{Run}_{k+1}) - \text{Duration}(\text{Run}_k)$$
- **Interpretation**:
  - `+15s`: The station cost the athlete 15 seconds in the following run (fatigue).
  - `-5s`: The athlete actually picked up pace after the station (recovery/acceleration).
- **Excluded**: Run 1 (start) and Run 8 (finish) as they don't have preceding/succeeding runs for this specific delta.

### "What If" Projection
For a race $R$ and adjustment percentages $p_{run}, p_{work}, p_{rox}$:
$$T_{projected} = \sum_{i=1}^{8} (Run_i \cdot (1 - \frac{p_{run}}{100})) + \sum_{j=1}^{8} (Workout_j \cdot (1 - \frac{p_{work}}{100})) + \sum_{k=1}^{7} (Roxzone_k \cdot (1 - \frac{p_{rox}}{100}))$$

## 4. Implementation Steps

1.  **Skeleton**: Create `js/analytics.js` and `js/simulator.js`. Link them in `index.html`.
2.  **Recovery Chart**:
    - Implement calculation in `analytics.js`.
    - Add `buildRecoveryChart` to `charts.js`.
    - Add section to `index.html`.
3.  **Simulator**:
    - Build UI controls in `index.html`.
    - Implement `updateSim()` in `simulator.js` to refresh projected times.
    - Update `app.js` to call these new rebuild functions on race toggle.
