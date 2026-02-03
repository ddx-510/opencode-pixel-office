import { Graphics, Text } from "@pixi/react";
import type { Graphics as PixiGraphics, TextStyle } from "pixi.js";
import { drawRoundedRect } from "./drawRoundedRect";

type ActivityBubbleData = {
  show: boolean;
  x: number;
  y: number;
  size: number;
  emoji: string;
  textX: number;
  textY: number;
};

type ActivityBubbleProps = {
  bubble: ActivityBubbleData;
  style: TextStyle;
};

const ActivityBubble = ({ bubble, style }: ActivityBubbleProps) => (
  <>
    <Graphics
      draw={(graphics: PixiGraphics) => {
        graphics.clear();
        if (!bubble.show) {
          return;
        }
        drawRoundedRect(
          graphics,
          bubble.x,
          bubble.y,
          bubble.size,
          bubble.size,
          6,
          0xf1f3ff,
          0x5a6aa0,
          1
        );
      }}
    />
    {bubble.show && (
      <Text text={bubble.emoji} x={bubble.textX} y={bubble.textY} style={style} />
    )}
  </>
);

export { ActivityBubble };
export type { ActivityBubbleData };
