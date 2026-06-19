/**
 * Station Recovery Analytics
 * Calculates the pace delta between the run immediately AFTER a station 
 * and the run immediately BEFORE that station.
 */

const RECOVERY_STATIONS = [
  'SkiErg',      // (Run 2 - Run 1)
  'Sled Push',   // (Run 3 - Run 2)
  'Sled Pull',   // (Run 4 - Run 3)
  'Burpee BJ',   // (Run 5 - Run 4)
  'Row',         // (Run 6 - Run 5)
  'Farmers C.',  // (Run 7 - Run 6)
  'Sand. Lunges' // (Run 8 - Run 7)
];

/**
 * Returns an array of 7 deltas (in seconds) for a given race.
 */
function calculateRecoveryDeltas(race) {
  if (!race || !race.runs || race.runs.length < 8) return [];
  
  const deltas = [];
  // Run index starts at 0, so Run 1 is race.runs[0]
  for (let i = 0; i < 7; i++) {
    const runBefore = race.runs[i];
    const runAfter  = race.runs[i + 1];
    deltas.push(runAfter - runBefore);
  }
  return deltas;
}
