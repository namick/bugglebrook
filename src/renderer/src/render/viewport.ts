export interface ViewportFit {
  /** CSS pixels per logical pixel. */
  scale: number;
  /** CSS size and offset of the letterboxed canvas. */
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * Fit a fixed logical resolution into a window, preserving aspect ratio and
 * centering it (letterboxing). All values are in CSS pixels.
 */
export function fitViewport(
  windowWidth: number,
  windowHeight: number,
  logicalWidth: number,
  logicalHeight: number,
): ViewportFit {
  const scale = Math.max(0.01, Math.min(windowWidth / logicalWidth, windowHeight / logicalHeight));
  const width = Math.round(logicalWidth * scale);
  const height = Math.round(logicalHeight * scale);
  return {
    scale,
    width,
    height,
    left: Math.floor((windowWidth - width) / 2),
    top: Math.floor((windowHeight - height) / 2),
  };
}
