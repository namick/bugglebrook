/**
 * World units are meters. The world is y-down to match the screen: y grows
 * toward the ground. The renderer converts with PIXELS_PER_METER.
 */
export const PIXELS_PER_METER = 100;

/** Logical render resolution (16:9). The window scales this to fit. */
export const VIEW_WIDTH_PX = 1920;
export const VIEW_HEIGHT_PX = 1080;
export const VIEW_WIDTH_M = VIEW_WIDTH_PX / PIXELS_PER_METER;
export const VIEW_HEIGHT_M = VIEW_HEIGHT_PX / PIXELS_PER_METER;

/**
 * Nominal ground height, in meters from the top of the view. The real
 * surface follows each area's terrain; this is its flat level.
 */
export const GROUND_Y = 9;

/** Cartoon gravity, a bit stronger than Earth's so flings feel snappy. */
export const GRAVITY = 20;

/** Cap on release speed: 2600 px/s (game design doc, section 2). */
export const MAX_FLING_SPEED = 26;

/** A release at or above this speed (m/s) is a fling; below it is a drop. */
export const FLING_SPEED = 2.5;

/** A bug landing at or above this speed (m/s) gets dizzy. */
export const DIZZY_SPEED = 9;

/** Impacts above this speed (m/s) count as a bonk. */
export const BONK_SPEED = 6;
