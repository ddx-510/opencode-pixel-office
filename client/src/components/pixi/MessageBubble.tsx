import { Graphics, Text } from "@pixi/react";
import type { Graphics as PixiGraphics, TextStyle } from "pixi.js";
import { drawRoundedRect } from "./drawRoundedRect";

type MessageBubbleData = {
  show: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  textX: number;
  textY: number;
  lines: string[];
};

type MessageBubbleProps = {
  bubble: MessageBubbleData;
  style: TextStyle;
};

const MessageBubble = ({ bubble, style }: MessageBubbleProps) => (
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
          bubble.width,
          bubble.height,
          4,
          0xf1fff3,
          0x3a5b3c,
          1.5
        );
      }}
    />
    {bubble.show && (
      <Text
        text={bubble.lines.join("\n")}
        x={bubble.textX}
        y={bubble.textY}
        style={style}
      />
    )}
  </>
);

export { MessageBubble };
export type { MessageBubbleData };
