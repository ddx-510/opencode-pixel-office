import type { PixiReactElementProps } from "@pixi/react";
import type { Container, Graphics, Text } from "pixi.js";

declare module "@pixi/react" {
  interface PixiElements {
    pixiContainer: PixiReactElementProps<typeof Container>;
    pixiGraphics: PixiReactElementProps<typeof Graphics>;
    pixiText: PixiReactElementProps<typeof Text>;
  }
}
