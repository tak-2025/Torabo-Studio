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

/**
 * Bounding box of the keys once rotation is applied, in layout units.
 *
 * A rotated key sweeps outside the rectangle its x/y/width/height describe, so
 * the four corners have to be rotated about the key's own origin before being
 * folded into the extents. Origins can also be negative, hence min as well as
 * max: the caller shifts everything so the drawn area starts at 0,0.
 */
function layoutExtents(positions: Array<KeyPosition>) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of positions) {
    const rad = ((p.r || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // scalePosition rotates about (rx, ry), defaulting to the key's own corner.
    const ox = p.rx ?? p.x;
    const oy = p.ry ?? p.y;

    for (const [cx, cy] of [
      [p.x, p.y],
      [p.x + p.width, p.y],
      [p.x, p.y + p.height],
      [p.x + p.width, p.y + p.height],
    ]) {
      const dx = cx - ox;
      const dy = cy - oy;
      const x = ox + dx * cos - dy * sin;
      const y = oy + dx * sin + dy * cos;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  // No keys: a zero-sized box, rather than Infinity in a style attribute.
  if (!positions.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
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

  // Extents of what is actually drawn, rotation included. Taking the corners
  // unrotated — as this did — leaves a thumb cluster hanging outside the box:
  // the box is centred, the keys are not, and at a high zoom the bottom row can
  // be clipped by a parent that hides overflow. For a board with no rotation
  // this comes out identical to the old two lines.
  const { minX, minY, maxX, maxY } = layoutExtents(positions);
  const rightMost = maxX - minX;
  const bottomMost = maxY - minY;

  const positionItems = positions.map((p, idx) => (
    // Shift so the top-left of the drawn area sits at the box origin. rx/ry move
    // with x/y, which leaves the rotation origin where it was relative to the key.
    <div
      className="absolute"
      style={scalePosition(
        {
          ...p,
          x: p.x - minX,
          y: p.y - minY,
          rx: p.rx === undefined ? undefined : p.rx - minX,
          ry: p.ry === undefined ? undefined : p.ry - minY,
        },
        oneU,
      )}
    >
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
