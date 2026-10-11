// The "proof log" under "Bit-exact in 3 steps". One row per check; the columns are aligned in
// ProofLog.astro, so just edit the text here.
export interface ProofRow {
  what: string;
  count: string;
  unit: string;
  result: string;
}

export const PROOF_ROWS: ProofRow[] = [
  { what: 'tyre formula', count: '329,734', unit: 'rows', result: 'identical' },
  { what: 'whole tyre', count: '97,800', unit: 'steps', result: 'identical' },
  { what: 'tracks', count: '8,800,000', unit: 'ray casts', result: 'identical' },
  { what: 'sound', count: '16,700,000', unit: 'FMOD calls', result: 'identical' },
  { what: 'renderer', count: '70+', unit: 'frames', result: 'identical pixels' },
  { what: 'sinf / powf', count: '4,294,967,296', unit: 'inputs', result: 'identical' },
];

export const PROOF_FOOTNOTE =
  "Fun find: Assetto Corsa isn't even bit-exact with itself. Its maths library takes a different code path on CPUs with FMA3.";
