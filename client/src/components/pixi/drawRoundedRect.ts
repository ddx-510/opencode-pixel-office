import type { Graphics as PixiGraphics } from "pixi.js";

const drawRoundedRect = (
  graphics: PixiGraphics,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillColor: number,
  strokeColor?: number,
  strokeWidth = 1
) => {
  graphics.beginFill(fillColor);
  graphics.drawRoundedRect(x, y, width, height, radius);
  graphics.endFill();
  if (strokeColor !== undefined) {
    graphics.lineStyle(strokeWidth, strokeColor, 1);
    graphics.drawRoundedRect(x, y, width, height, radius);
    graphics.lineStyle(0, 0, 0);
  }
};

export { drawRoundedRect };
