// What loads in rustyAC and what is refused, for /compatibility.
//
// How to update it:
// - Every number and name here comes from a report in rustyAC's docs/port/ (named in the comment
//   above each block). When a newer report restates a number, change it here and keep the comment
//   pointing at that report.
// - The counts are for the one Assetto Corsa install the reports were written on (base game, some
//   DLC and a few mods), not for the game's whole catalogue. Keep that wording on the page.
// - The reports list tracks and cars by folder name only, so that is what the page shows.

// docs/port/suspensions.md, sections 1 and 4 (v0.17.0): "119 of the 123 installed cars"
export const CARS = { installed: 123, loaded: 119, refused: 4 };

export interface RefusedCar {
  folder: string;
  reason: string;
}

// docs/port/suspensions.md, section 4; docs/port/awd_ers.md, section 6
export const REFUSED_CARS: RefusedCar[] = [
  { folder: 'vrc_formula_alpha_2025_csp', reason: 'Its suspension type, COSMIC, is Custom Shaders Patch’s own.' },
  { folder: 'vrc_formula_alpha_2026_csp', reason: 'Its suspension type, COSMIC, is Custom Shaders Patch’s own.' },
  { folder: 'vrc_formula_beta_2024_csp', reason: 'Its suspension type, COSMIC, is Custom Shaders Patch’s own.' },
  { folder: 'urd_darche_992_23', reason: 'Its data files are encrypted for Custom Shaders Patch. rustyAC does not decrypt them.' },
];

export interface Support {
  what: string;
  detail: string;
}

// docs/port/suspensions.md section 1; docs/port/drivetrain.md section 2.1; docs/port/awd_ers.md
// sections 1 and 3.1; docs/port/whole_car.md section 1
export const CAR_SYSTEMS: Support[] = [
  { what: 'Suspension', detail: 'Double wishbone, strut, rigid rear axle and multilink, plus heave springs and anti-roll bars.' },
  { what: 'Rear-wheel steering', detail: 'As on the Ferrari 812 Superfast and the Porsche Panamera.' },
  { what: 'Drivetrain', detail: 'Rear-, front- and four-wheel drive (both of the game’s four-wheel-drive types).' },
  { what: 'Engine', detail: 'Turbos with wastegate, the rev limiter, engine damage.' },
  { what: 'Hybrids', detail: 'KERS and ERS, with the cockpit’s delivery and recovery settings.' },
  { what: 'Aero', detail: 'Wings, active aero and DRS, inside the track’s DRS zones.' },
  { what: 'Driving aids', detail: 'Traction control, ABS, the automatic clutch, auto-blip, the automatic gearbox and the pit-lane limiter.' },
  { what: 'Tyres', detail: 'The current tyre model and the older one that many cars made by others still use.' },
  { what: 'Damage', detail: 'Contacts with walls, rollovers, bent suspension and tyre bursts.' },
];

// docs/port/tracks.md, section 1 (v0.18.0): "23 track folders with 54 entries in the track menu ...
// 44 of them load and drive. 10 are refused with the reason"
export const TRACKS = { folders: 23, entries: 54, loaded: 44, refused: 10 };

export interface TrackEntry {
  folder: string;
  /** empty for a track with a single layout */
  layouts: string[];
  note?: string;
}

// docs/port/tracks.md, section 3 (the survey table)
export const LOADED_TRACKS: TrackEntry[] = [
  { folder: 'drift', layouts: [] },
  { folder: 'imola', layouts: [] },
  { folder: 'ks_black_cat_county', layouts: ['layout_int', 'layout_long', 'layout_short'] },
  { folder: 'ks_drag', layouts: ['drag200', 'drag400', 'drag500', 'drag1000', 'drag2000'] },
  { folder: 'ks_highlands', layouts: ['layout_drift', 'layout_int', 'layout_long', 'layout_short'] },
  { folder: 'ks_laguna_seca', layouts: [] },
  { folder: 'ks_monza66', layouts: ['full', 'junior', 'road'] },
  { folder: 'ks_nordschleife', layouts: ['endurance', 'endurance_cup', 'nordschleife', 'touristenfahrten'], note: 'touristenfahrten is point-to-point' },
  { folder: 'ks_nurburgring', layouts: ['layout_gp_a', 'layout_gp_b', 'layout_sprint_a', 'layout_sprint_b'] },
  { folder: 'ks_red_bull_ring', layouts: ['layout_gp', 'layout_national'] },
  { folder: 'ks_silverstone', layouts: ['gp', 'international', 'national'] },
  { folder: 'ks_silverstone1967', layouts: [] },
  { folder: 'ks_vallelunga', layouts: ['classic_circuit', 'club_circuit', 'extended_circuit'] },
  { folder: 'ks_zandvoort', layouts: [] },
  { folder: 'magione', layouts: [] },
  { folder: 'montreal', layouts: [], note: 'a mod' },
  { folder: 'monza', layouts: [] },
  { folder: 'mugello', layouts: [] },
  { folder: 'spa', layouts: [] },
  { folder: 'trento-bondone', layouts: [], note: 'a point-to-point hill climb' },
  { folder: 'vhe_interlagos', layouts: ['gp', 'norm'], note: 'a mod' },
];

export interface RefusedTrack {
  entry: string;
  kind: 'not-installed' | 'csp';
}

// docs/port/tracks.md, sections 3 and 6
export const REFUSED_TRACKS: RefusedTrack[] = [
  { entry: 'ks_barcelona / layout_gp', kind: 'not-installed' },
  { entry: 'ks_barcelona / layout_moto', kind: 'not-installed' },
  { entry: 'ks_barcelona / layout_moto_fa_2026', kind: 'not-installed' },
  { entry: 'ks_brands_hatch / gp', kind: 'not-installed' },
  { entry: 'ks_brands_hatch / indy', kind: 'not-installed' },
  { entry: 'ks_red_bull_ring / layout_gp_fa_2026', kind: 'csp' },
  { entry: 'ks_silverstone / gp_fa_2026', kind: 'csp' },
  { entry: 'montreal / montreal_fa_2026', kind: 'csp' },
  { entry: 'monza / monza_fa_2026', kind: 'csp' },
  { entry: 'spa / spa_fa_2026', kind: 'csp' },
];

export const REFUSED_TRACK_REASON: Record<RefusedTrack['kind'], string> = {
  'not-installed': 'Not installed: only the menu entry of a track that is not owned is there.',
  csp: 'Made for Custom Shaders Patch only: plain Assetto Corsa cannot read its surfaces file either.',
};

// docs/port/tracks.md, section 1: "13 of your tracks have loose objects (282 in all ...)"
export const LOOSE_OBJECTS = { tracks: 13, objects: 282 };

// docs/port/tracks.md, section 8 "What is not there"; docs/port/several_cars.md
export const TRACK_LIMITS: string[] = [
  'A race: the grid, AI drivers, flags, pit stops and penalties.',
  'The game’s drag mode, with its own timing and start lights. The drag strips load and can be driven.',
  'A second session after the first, such as qualifying after practice.',
  'Custom Shaders Patch’s extras on a plain track are ignored.',
];
