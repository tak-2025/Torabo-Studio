import {
  PhysicalLayout,
  Keymap as KeymapMsg,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import {
  LayoutZoom,
  PhysicalLayout as PhysicalLayoutComp,
} from "./PhysicalLayout";
import { KeyFace } from "./KeyFace";
import { useKeyLayout } from "./KeyLayoutContext";
import { useMacroNames } from "../dynamic_macros/MacroNamesContext";
import { LayerRef, resolveBindingFace } from "./binding-face";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

export interface KeymapProps {
  layout: PhysicalLayout;
  keymap: KeymapMsg;
  behaviors: BehaviorMap;
  scale: LayoutZoom;
  selectedLayerIndex: number;
  selectedKeyPosition: number | undefined;
  onKeyPositionClicked: (keyPosition: number) => void;
}

export const Keymap = ({
  layout,
  keymap,
  behaviors,
  scale,
  selectedLayerIndex,
  selectedKeyPosition,
  onKeyPositionClicked,
}: KeymapProps) => {
  const { keyLayout } = useKeyLayout();
  // Slot names for `&dmac` keycaps, filled in once the macros panel has read a
  // names-capable keyboard; null until then, which draws M<N>.
  const macroNames = useMacroNames();

  if (!keymap.layers[selectedLayerIndex]) {
    return <></>;
  }

  // Hold-tap headers name the layer they switch to, so the face resolver needs
  // the layer list. Index doubles as the fallback name, matching LayerPicker.
  const layers: LayerRef[] = keymap.layers.map(({ id, name }, li) => ({
    id,
    name: name || li.toLocaleString(),
  }));

  const positions = layout.keys.map((k, i) => {
    if (i >= keymap.layers[selectedLayerIndex].bindings.length) {
      return {
        id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
        header: "Unknown",
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        children: <span></span>,
      };
    }

    const binding = keymap.layers[selectedLayerIndex].bindings[i];
    const face = resolveBindingFace(
      binding,
      behaviors[binding.behaviorId],
      layers,
      macroNames
    );

    return {
      id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
      header: behaviors[binding.behaviorId]?.displayName || "Unknown",
      hold: face.hold,
      muted: face.muted,
      x: k.x / 100.0,
      y: k.y / 100.0,
      width: k.width / 100,
      height: k.height / 100.0,
      r: (k.r || 0) / 100.0,
      rx: (k.rx || 0) / 100.0,
      ry: (k.ry || 0) / 100.0,
      children: (
        <KeyFace usage={face.usage} text={face.text} keyLayout={keyLayout} />
      ),
    };
  });

  return (
    <PhysicalLayoutComp
      positions={positions}
      oneU={48}
      hoverZoom={true}
      zoom={scale}
      selectedPosition={selectedKeyPosition}
      onPositionClicked={onKeyPositionClicked}
    />
  );
};
