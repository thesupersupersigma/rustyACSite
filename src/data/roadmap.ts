// The roadmap on /progress, and the one-line titles the changelog shows next to each version.
//
// How to update it:
// - The source is the ROADMAP section at the top of rustyAC's brainstorm.md (a private notes file)
//   and the reports in rustyAC's docs/port/. Rewrite a row for the public here: no server or network
//   details, no names of people, none of the "beyond vanilla" side ideas except the four in LATER.
// - When a task is finished: set `status: 'done'`, add `version` (the rustyAC tag it shipped in) and
//   `report` (its file name in docs/port/). The page links the report once that version is on
//   GitHub's release list, so a task that is tagged but not pushed yet shows no dead link.
// - `detail` is one plain sentence. Every number in it must be in the task's report.
// - A new phase or task is a new entry in PHASES; the page draws whatever is here.
// - PROGRESS_NOTE is only shown because the roadmap states it. Change it when the roadmap does, and
//   delete it if the roadmap stops saying how far along the project is.

export type TaskStatus = 'done' | 'progress' | 'planned' | 'parked';

export interface RoadmapTask {
  /** the task number as the reports use it ("17", "20w") */
  id: string;
  title: string;
  detail: string;
  status: TaskStatus;
  /** the rustyAC tag it shipped in */
  version?: string;
  /** the report's file name in rustyAC's docs/port/ */
  report?: string;
}

export interface Phase {
  n: number;
  title: string;
  status: TaskStatus;
  intro: string;
  tasks: RoadmapTask[];
}

export const STATUS_TEXT: Record<TaskStatus, string> = {
  done: 'done',
  progress: 'in progress',
  planned: 'planned',
  parked: 'parked',
};

/** brainstorm.md, ROADMAP: "Where we are: about 33% of the full rewrite." (written at v0.19.0) */
export const PROGRESS_NOTE = {
  text: 'About a third of the way.',
  detail:
    'That is the roadmap’s own estimate, written when sound was finished (v0.19.0): the car physics and every track were done, with the renderer and the menus as the biggest pieces left. Most of the renderer has been ported since.',
};

export const PHASES: Phase[] = [
  {
    n: 1,
    title: 'One car, one track',
    status: 'done',
    intro: 'The Ferrari F2004 at Spa: physics that match the game bit for bit, crashes and damage, keyboard and gamepad, automatic releases.',
    tasks: [
      // docs/port/sctm.md
      { id: '03', title: 'The tyre formula', detail: '329,734 rows of the tyre formula match the game.', status: 'done', report: 'sctm.md' },
      // docs/port/tyre_step.md
      { id: '04', title: 'The whole tyre', detail: 'One full tyre step, with its data loader: 97,800 steps match.', status: 'done', report: 'tyre_step.md' },
      // docs/port/ode_stage1.md
      { id: '07', title: 'The rigid-body solver', detail: 'The physics library the game uses (ODE), ported to Rust: bodies, joints and the solver.', status: 'done', report: 'ode_stage1.md' },
      // docs/port/rolling_chassis.md
      { id: '08', title: 'A rolling chassis', detail: 'Double wishbones, heave springs, anti-roll bars, steering and force feedback.', status: 'done', report: 'rolling_chassis.md' },
      // docs/port/drivetrain.md
      { id: '09', title: 'Engine and drivetrain', detail: 'Brakes, engine and turbo, clutch, gearbox, differential and the shifting aids.', status: 'done', report: 'drivetrain.md' },
      // docs/port/whole_car.md
      { id: '10', title: 'The whole car', detail: 'Aero, driving aids and the car’s own step: a complete car that matches the game.', status: 'done', report: 'whole_car.md' },
      // docs/port/track.md
      { id: '12', title: 'Spa', detail: 'The track’s model, ray casts against it, surfaces and lap timing.', status: 'done', report: 'track.md' },
      // docs/port/contacts.md
      { id: '13', title: 'Contacts and damage', detail: 'Walls, the floor, rollovers and damage.', status: 'done', report: 'contacts.md' },
      // docs/release.md
      { id: '14', title: 'CI and automatic releases', detail: 'Every push is built and tested on GitHub; a version tag publishes a Windows build.', status: 'done', version: 'v0.14.0' },
    ],
  },
  {
    n: 2,
    title: 'A proper single-player build',
    status: 'done',
    intro: 'Every car and every track that plain Assetto Corsa can load.',
    tasks: [
      // docs/port/conditions.md
      { id: '15', title: 'Session conditions and setups', detail: 'Temperatures, grip and wind from your last Assetto Corsa session, saved setups, the game’s cameras, and cars read straight from your install.', status: 'done', version: 'v0.15.0', report: 'conditions.md' },
      // docs/port/awd_ers.md
      { id: '16', title: 'Four-wheel drive, KERS and ERS', detail: 'Four-wheel drive, hybrid systems and DRS zones.', status: 'done', version: 'v0.16.0', report: 'awd_ers.md' },
      // docs/port/suspensions.md
      { id: '17', title: 'Every suspension', detail: 'Strut, axle and multilink suspension, rear-wheel steering and the old tyre model: 119 of 123 installed cars load.', status: 'done', version: 'v0.17.0', report: 'suspensions.md' },
      // docs/port/tracks.md
      { id: '18', title: 'Every track', detail: 'All 44 drivable layouts, point-to-point tracks and loose cones.', status: 'done', version: 'v0.18.0', report: 'tracks.md' },
    ],
  },
  {
    n: 3,
    title: 'Assetto Corsa’s real look and sound',
    status: 'progress',
    intro: 'The game’s own compiled shaders and sound banks, loaded from your install and driven the way the game drives them.',
    tasks: [
      // docs/port/audio.md
      { id: '19', title: 'Sound', detail: 'The game’s own FMOD libraries and sound banks, loaded from your install.', status: 'done', version: 'v0.19.0', report: 'audio.md' },
      // docs/port/renderer_core.md
      { id: '20', title: 'The game’s own shaders', detail: 'Materials, lighting, the sky, shadows and reflections.', status: 'done', version: 'v0.20.0', report: 'renderer_core.md' },
      // docs/port/web.md
      { id: '20w', title: 'Browser preview', detail: 'The physics compiled to WebAssembly, with a small picture, keyboard and gamepad.', status: 'done', version: 'v0.20.1', report: 'web.md' },
      // docs/port/web.md
      { id: '20w.2', title: 'Driving aids in the browser', detail: 'Traction control, ABS and brake bias keys, with their levels on the display.', status: 'done', version: 'v0.20.2', report: 'web.md' },
      // docs/port/renderer_car.md
      { id: '21', title: 'The whole car, drawn', detail: 'The driver, lights, dials, damage, smoke, skid marks, flames and mirrors.', status: 'done', version: 'v0.21.0', report: 'renderer_car.md' },
      // docs/port/renderer_scene.md
      { id: '22', title: 'The rest of the scene', detail: 'Clouds and a moving sun, crowds, digital dashboards and the high-quality mirror.', status: 'done', version: 'v0.22.0', report: 'renderer_scene.md' },
      // docs/port/damage_sparkles.md
      { id: '22b', title: 'Damage, sparkles and max graphics', detail: 'Suspension damage, the white sparkles on trees explained, and --graphics max.', status: 'done', version: 'v0.22.1', report: 'damage_sparkles.md' },
      // docs/port/renderer_leftovers.md
      { id: '22c', title: 'Scene leftovers', detail: 'The pit crew, the ideal line, start lights and replay controls.', status: 'done', version: 'v0.22.2', report: 'renderer_leftovers.md' },
      // docs/port/postfx.md
      { id: '23', title: 'Anti-aliasing and motion blur', detail: 'MSAA, FXAA and motion blur.', status: 'done', version: 'v0.23.0', report: 'postfx.md' },
      // brainstorm.md ROADMAP, task 23b
      { id: '23b', title: 'Post-processing filters', detail: 'The game’s post-processing library is mapped but not ported. It comes back as a side quest.', status: 'parked' },
    ],
  },
  {
    n: 4,
    title: 'Racing',
    status: 'progress',
    intro: 'More than one car on the track, then drivers and the rules of a race.',
    tasks: [
      // docs/port/several_cars.md
      { id: '24', title: 'Several cars', detail: 'Physics for several cars at once, car-to-car contacts and the pit-lane rule.', status: 'done', version: 'v0.24.0', report: 'several_cars.md' },
      { id: '24b', title: 'Drawing and hearing every car', detail: 'Every car drawn and heard, and switching between them.', status: 'planned' },
      { id: 'M1', title: 'Multiplayer on the desktop', detail: 'Assetto Corsa’s own network protocol, so rustyAC joins a normal Assetto Corsa server next to players of the real game.', status: 'planned' },
      { id: 'M2', title: 'Multiplayer in the browser', detail: 'The same network code in the browser preview.', status: 'planned' },
      { id: '25', title: 'AI drivers', detail: 'The game’s computer-controlled drivers.', status: 'planned' },
      { id: '26', title: 'Race rules', detail: 'Race starts, flags, penalties, pit stops and replays in the game’s format.', status: 'planned' },
    ],
  },
  {
    n: 5,
    title: 'The game around it',
    status: 'planned',
    intro: 'Everything that is not driving.',
    tasks: [
      { id: '27–28', title: 'Menus', detail: 'Car and track select, the setup screen, the on-screen apps and settings.', status: 'planned' },
      { id: '29', title: 'Python apps', detail: 'The interface Assetto Corsa’s Python apps use.', status: 'planned' },
    ],
  },
];

/** brainstorm.md, ROADMAP, phase 6. Only these four are public. */
export const LATER: string[] = ['Enhanced physics', 'CSP compatibility', 'Soft-body damage', 'An original free car'];

const REPORTS = 'https://github.com/thesupersupersigma/rustyAC/blob/master/docs/port/';
export const reportUrl = (file: string): string => `${REPORTS}${file}`;

/** "v0.17.0" -> "Every suspension": what a release was about, for the changelog. */
export function titleForVersion(tag: string): string | undefined {
  for (const phase of PHASES) {
    const task = phase.tasks.find((t) => t.version === tag);
    if (task) return task.title;
  }
  return undefined;
}
