// "What works today" on the homepage. Edit this list to change the grid.
export type Status = 'done' | 'mostly' | 'preview' | 'planned';

export interface StatusRow {
  area: string;
  status: Status;
  detail: string;
}

export const STATUS_LABEL: Record<Status, string> = {
  done: 'done',
  mostly: 'mostly done',
  preview: 'preview',
  planned: 'planned',
};

export const STATUS_ROWS: StatusRow[] = [
  { area: 'Tyres', status: 'done', detail: '329,734 rows of the tyre formula identical' },
  { area: 'Car physics', status: 'done', detail: '119 of 123 installed cars load' },
  { area: 'Tracks', status: 'done', detail: 'All 44 drivable layouts, 8.8 M ray casts identical' },
  { area: 'Contacts and damage', status: 'done', detail: 'Walls, rollovers, bent steering, tyre bursts' },
  { area: 'Sound', status: 'done', detail: "16.7 M FMOD calls identical to AC's" },
  { area: 'Renderer', status: 'mostly', detail: 'Identical D3D11 commands and pixels on 70+ frames' },
  { area: 'Browser preview', status: 'preview', detail: 'The same physics as WebAssembly, bit-exact with the desktop' },
  { area: 'Still to come', status: 'planned', detail: 'AI, race rules, menus, multiplayer, Enhanced physics' },
];
