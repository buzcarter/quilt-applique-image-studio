// Shared app configuration values.
export const config = {
  svg: {
    // Safety-net floor: contours below this area (sq processing-pixels) are always
    // discarded. The real threshold comes from minPieceSize × pxPerInch at runtime.
    min_area: 100,
  },
};
