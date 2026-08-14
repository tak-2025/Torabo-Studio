/**
 * Measures what the keymap view's "自動" zoom actually decides.
 *
 * The board is short and wide (14.5u x 4.71u), and it renders far smaller than
 * the space it is given. This mounts the real PhysicalLayout in containers of
 * known size and reports the scale it lands on, so the fix can be judged
 * against numbers rather than a screenshot.
 *
 * Dev tool: not a build input.
 */

import React from "react";
import ReactDOM from "react-dom/client";

import { PhysicalLayout, KeyPosition } from "../src/keyboard/PhysicalLayout";
import layouts from "../src/keyboard/torabo-tsuki-layouts.json";
import "../src/index.css";

interface RawKey {
  x: number;
  y: number;
  width: number;
  height: number;
  r?: number;
  rx?: number;
  ry?: number;
}

const keys = (layouts as { name: string; keys: RawKey[] }[])[0].keys;

const positions: KeyPosition[] = keys.map((k, i) => ({
  id: `k-${i}`,
  x: k.x / 100,
  y: k.y / 100,
  width: k.width / 100,
  height: k.height / 100,
  r: (k.r || 0) / 100,
  rx: (k.rx || 0) / 100,
  ry: (k.ry || 0) / 100,
}));

/** One container of a fixed size, mirroring the keymap panel's grid cell. */
function Case({ w, h, label }: { w: number; h: number; label: string }) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [info, setInfo] = React.useState("測定中…");

  React.useEffect(() => {
    // After layout + the component's own useLayoutEffect have run.
    const t = setTimeout(() => {
      const parent = hostRef.current;
      const el = parent?.firstElementChild as HTMLElement | null;
      if (!parent || !el) return;
      const scale = new DOMMatrix(getComputedStyle(el).transform).a;

      // Where the keys actually land on screen, not where the box says they
      // should: rotated thumb keys stick out past the declared height, which
      // is exactly the kind of thing that makes a board look off-centre.
      const box = parent.getBoundingClientRect();
      let top = Infinity;
      let bottom = -Infinity;
      let left = Infinity;
      let right = -Infinity;
      el.querySelectorAll("*").forEach((n) => {
        const r = (n as HTMLElement).getBoundingClientRect();
        if (!r.width && !r.height) return;
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
        left = Math.min(left, r.left);
        right = Math.max(right, r.right);
      });

      const gapTop = top - box.top;
      const gapBottom = box.bottom - bottom;
      const gapLeft = left - box.left;
      const gapRight = box.right - right;
      // Key draws itself oneU-2 px so keys don't touch, which leaves ~2px of
      // slack on the right and bottom edges. That is the gap between keys, not
      // a centring error, so the tolerance has to clear it.
      const centred =
        Math.abs(gapTop - gapBottom) <= 4 && Math.abs(gapLeft - gapRight) <= 4;

      setInfo(
        `枠 ${parent.clientWidth}x${parent.clientHeight} / ` +
          `箱 ${el.clientWidth}x${el.clientHeight} → scale ${scale.toFixed(2)} / ` +
          `実描画 ${(right - left).toFixed(0)}x${(bottom - top).toFixed(0)} ` +
          `（高さ ${(((bottom - top) / box.height) * 100).toFixed(0)}%）` +
          ` | 余白 上${gapTop.toFixed(0)} 下${gapBottom.toFixed(0)} ` +
          `左${gapLeft.toFixed(0)} 右${gapRight.toFixed(0)} → ` +
          (centred ? "中央" : "⚠ 中央でない"),
      );
    }, 150);
    return () => clearTimeout(t);
  }, [w, h]);

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ fontWeight: 600, fontSize: ".9rem" }}>{label}</div>
      <div style={{ fontSize: ".8rem", opacity: 0.75, marginBottom: ".25rem" }}>
        {info}
      </div>
      <div
        ref={hostRef}
        className="grid items-center justify-center relative"
        style={{
          width: w,
          height: h,
          outline: "2px dashed #2563eb",
          background: "#f3f4f6",
        }}
      >
        <PhysicalLayout positions={positions} zoom="auto" />
      </div>
    </div>
  );
}

function App() {
  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.2rem" }}>keymap 自動ズームの実測</h1>
      <p style={{ fontSize: ".85rem", opacity: 0.8 }}>
        青い枠が与えられた領域。盤面がそれをどれだけ使えているかを見る。 window
        = {window.innerWidth}x{window.innerHeight}
      </p>
      <Case w={1400} h={440} label="広いウィンドウ（実使用に近い）" />
      <Case w={1000} h={600} label="やや狭い" />
      <Case w={700} h={300} label="小さい" />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
