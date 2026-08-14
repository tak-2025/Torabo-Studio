import {
  CSSProperties,
  PropsWithChildren,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Key } from "./Key";

export type KeyPosition = PropsWithChildren<{
  id: string;
  header?: string;
  width: number;
  height: number;
  x: number;
  y: number;
  r?: number;
  rx?: number;
  ry?: number;
}>;

/** Breathing room left around the board in "auto", per side, as a fraction of
 *  the container. Small on purpose: the point of auto is to fill the space. */
const AUTO_ZOOM_MARGIN = 0.04;

export type LayoutZoom = number | "auto";

export function deserializeLayoutZoom(value: string): LayoutZoom {
  if (value === "auto") {
    return "auto";
  }
  return parseFloat(value) || "auto";
}

interface PhysicalLayoutProps {
  positions: Array<KeyPosition>;
  selectedPosition?: number;
  /** Optional multi-select predicate; when given it overrides selectedPosition
   *  for highlighting (used by the combo editor to mark several keys). */
  isPositionSelected?: (position: number) => boolean;
  oneU?: number;
  hoverZoom?: boolean;
  zoom?: LayoutZoom;
  onPositionClicked?: (position: number) => void;
}

interface PhysicalLayoutPositionLocation {
  x: number;
  y: number;
  r?: number;
  rx?: number;
  ry?: number;
}

function scalePosition(
  { x, y, r, rx, ry }: PhysicalLayoutPositionLocation,
  oneU: number,
): CSSProperties {
  let left = x * oneU;
  let top = y * oneU;
  let transformOrigin = undefined;
  let transform = undefined;
  const transformStyle = "preserve-3d";

  if (r) {
    let transformX = ((rx || x) - x) * oneU;
    let transformY = ((ry || y) - y) * oneU;
    transformOrigin = `${transformX}px ${transformY}px`;
    transform = `rotate(${r}deg)`;
  }

  return {
    top,
    left,
    transformOrigin,
    transform,
    transformStyle,
  };
}

export const PhysicalLayout = ({
  positions,
  selectedPosition,
  isPositionSelected,
  oneU = 48,
  onPositionClicked,
  ...props
}: PhysicalLayoutProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const parent = element.parentElement;
    if (!parent) return;

    const calculateScale = () => {
      if (props.zoom === "auto") {
        // Margin as a fraction of the space available, not an absolute derived
        // from the window. Upstream takes 5% of the smaller window dimension
        // and adds it to BOTH sides of BOTH axes of the board — which lands on
        // a short, wide split keyboard hardest: 44px a side against a 226px-tall
        // board is a third of its height spent on margin, and the board renders
        // at ~70% of the room it has. Scaling the margin with the container
        // keeps the proportion the same whatever the window size.
        const usable = 1 - 2 * AUTO_ZOOM_MARGIN;
        const newScale = Math.min(
          (parent.clientWidth * usable) / element.clientWidth,
          (parent.clientHeight * usable) / element.clientHeight,
        );
        setScale(newScale);
      } else {
        setScale(props.zoom || 1);
      }
    };

    calculateScale(); // Initial calculation

    const resizeObserver = new ResizeObserver(() => {
      calculateScale();
    });

    resizeObserver.observe(element);
    resizeObserver.observe(parent);

    return () => {
      resizeObserver.disconnect();
    };
  }, [props.zoom]);

  // TODO: Add a bit of padding for rotation when supported
  let rightMost = positions
    .map((k) => k.x + k.width)
    .reduce((a, b) => Math.max(a, b), 0);
  let bottomMost = positions
    .map((k) => k.y + k.height)
    .reduce((a, b) => Math.max(a, b), 0);

  const positionItems = positions.map((p, idx) => (
    <div className="absolute" style={scalePosition(p, oneU)}>
      <div
        key={p.id}
        onClick={() => onPositionClicked?.(idx)}
        className="hover:[transform:translateZ(100px)] transition-transform duration-200"
      >
        <Key
          oneU={oneU}
          selected={
            isPositionSelected
              ? isPositionSelected(idx)
              : idx === selectedPosition
          }
          {...p}
        />
      </div>
    </div>
  ));

  return (
    <div
      className="relative"
      style={{
        height: bottomMost * oneU + "px",
        width: rightMost * oneU + "px",
        transform: `scale(${scale})`,
        transformStyle: "preserve-3d",
      }}
      ref={ref}
      {...props}
    >
      {positionItems}
    </div>
  );
};
