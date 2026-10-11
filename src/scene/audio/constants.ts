// Every number worth tuning in the sound, in one block. Levels are in decibels (0 = as recorded,
// +6 is about twice as loud, -6 about half). "Seconds" for a smoothing means the time to get most
// of the way (about 95%) to a new value.
//
// The clips come from rustyAC with one common gain, so 0 dB everywhere reproduces the game's own
// balance between engine, tyres and pit guns.

export const AUDIO = {
  // ---- master --------------------------------------------------------------------------------
  /** Overall level of everything. */
  MASTER_DB: -3,
  /** Nothing leaves the page louder than this (dBFS). A hard ceiling after the compressor. */
  CEILING_DB: -1,
  /**
   * The safety compressor: where it starts to work (dBFS) and how hard (20 = 20 dB in for 1 dB out).
   * The engine flat out peaks around -8 dBFS, so it only catches the tyre burst and stacked sounds.
   */
  COMP_THRESHOLD_DB: -3,
  COMP_RATIO: 20,
  /** Seconds the compressor takes to clamp down, and to let go. */
  COMP_ATTACK: 0.002,
  COMP_RELEASE: 0.12,
  /** Seconds of fade when sound goes on or off (the toggle, scrolling away, hiding the tab). */
  FADE_SECONDS: 0.15,

  // ---- engine --------------------------------------------------------------------------------
  /** Level of the engine loops and the limiter loop. */
  ENGINE_DB: 0,
  /** A loop is never played slower or faster than this, however far the revs are from its own. */
  RATE_MIN: 0.8,
  RATE_MAX: 1.25,
  /** Seconds for the on-throttle sound to take over from the off-throttle sound, and back. */
  THROTTLE_SECONDS: 0.06,
  /** Seconds for the limiter loop to take over once the revs are on the limiter, and to hand back. */
  LIMITER_SECONDS: 0.08,
  /** Seconds every gain and pitch takes to follow its value from frame to frame (kills zipper noise). */
  PARAM_SECONDS: 0.04,

  // ---- wheelspin -----------------------------------------------------------------------------
  /** Level of the tyre squeal, in dB. The game's mix has it about 20 dB under the engine; on the site it sells the burnout. */
  WHEELSPIN_GAIN: 9,
  /** Rear wheel speed (share of the top speed) where the squeal starts, and where it is at full level. */
  WHEELSPIN_START: 0.04,
  WHEELSPIN_FULL: 0.55,
  /** Pitch of the squeal with the wheels barely turning, and at top speed. */
  WHEELSPIN_RATE_MIN: 0.9,
  WHEELSPIN_RATE_MAX: 1.15,
  /** Seconds the squeal takes to follow the wheels. */
  WHEELSPIN_SECONDS: 0.09,

  // ---- backfires -----------------------------------------------------------------------------
  /** Level of a backfire at its loudest. */
  BACKFIRE_DB: 2,
  /** Lifting off below these revs gives no backfire. */
  BACKFIRE_MIN_RPM: 9000,
  /** A lift gives 1 to this many bangs. */
  BACKFIRE_MAX_COUNT: 3,
  /** Seconds from the lift to the first bang (at most), and between bangs (least, most). */
  BACKFIRE_FIRST_MAX: 0.05,
  BACKFIRE_GAP_MIN: 0.06,
  BACKFIRE_GAP_MAX: 0.14,
  /** Each bang gets a random pitch between these, and a random level between this and 0 dB. */
  BACKFIRE_RATE_MIN: 0.9,
  BACKFIRE_RATE_MAX: 1.1,
  BACKFIRE_QUIETEST_DB: -3,
  /** Chance that one ignition cut on the limiter (about 9 a second) pops, and how much quieter those are. */
  BACKFIRE_LIMITER_CHANCE: 0.035,
  BACKFIRE_LIMITER_DB: -5,
  /** Seconds that must pass between two limiter pops. */
  BACKFIRE_LIMITER_GAP: 0.35,

  // ---- the tyre burst (made in code: the game has no such sound) --------------------------------
  /** Loudness of the whole burst. */
  BURST_DB: 3,
  /** Seconds between the two tyres letting go, and how far left and right of the car they sit (0 to 1). */
  BURST_GAP: 0.04,
  BURST_SPREAD: 0.55,
  /** The crack: seconds of noise, its high-pass, and the low-pass sweeping down from / to (Hz). */
  CRACK_LEVEL: 1,
  CRACK_SECONDS: 0.025,
  CRACK_HIGHPASS: 700,
  CRACK_LOWPASS_FROM: 14000,
  CRACK_LOWPASS_TO: 1600,
  /** The thump: a sine falling from / to (Hz) over this many seconds. */
  THUMP_LEVEL: 0.9,
  THUMP_FROM: 90,
  THUMP_TO: 45,
  THUMP_SECONDS: 0.18,
  /** The air hiss: noise around this frequency (Hz, with this sharpness), fading over this many seconds. */
  HISS_LEVEL: 0.3,
  HISS_HZ: 2900,
  HISS_Q: 0.7,
  HISS_SECONDS: 0.7,

  // ---- pit stop ------------------------------------------------------------------------------
  /** Level of the wheel guns, in dB (the clips are quiet). */
  PIT_GAIN: 12,
  /** Each gun starts up to this many seconds late, so four guns do not sound like one. */
  PIT_OFFSET_MAX: 0.06,
  /** Each gun's pitch is off by up to this share either way (0.04 = 4%). */
  PIT_PITCH_SPREAD: 0.04,
  /** Level of the soft thump when the car lands (made in code). -60 or lower turns it off. */
  DROP_THUMP_DB: -15,

  // ---- space ---------------------------------------------------------------------------------
  /** How far the car's sound moves between the speakers as it moves on screen (0 = always in the middle). */
  PAN_WIDTH: 1.5,
  /** The same for the pit guns, which should clearly come from their wheel. */
  FX_PAN_WIDTH: 3,
  /** No sound is ever panned further than this (1 = one speaker only). */
  PAN_MAX: 0.8,
  /** Camera distance (m) with no loss, the distance where the loss below is reached, and that loss. */
  DISTANCE_NEAR: 4.5,
  DISTANCE_FAR: 9,
  DISTANCE_FAR_DB: -5,
  /** The loss never goes past this, however far the camera is. */
  DISTANCE_MAX_DB: -12,
  /** Seconds the pan and the distance loss take to follow the camera. */
  SPACE_SECONDS: 0.2,
};
