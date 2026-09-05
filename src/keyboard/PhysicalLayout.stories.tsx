import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { PhysicalLayout } from "./PhysicalLayout";
import { keyShapeAt, standardKeyCount } from "./extensionKeys";
import toraboLayouts from "./torabo-tsuki-layouts.json";
import { HidUsageLabel } from "./HidUsageLabel";
import { hid_usage_from_page_and_id } from "../hid-usages";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
  title: "Keyboard/PhysicalLayout",
  component: PhysicalLayout,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ["autodocs"],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  argTypes: {},
  args: {
    onPositionClicked: fn(),
  },
} satisfies Meta<typeof PhysicalLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

const TOP = [41, ...[..."QWERTYUIOP"].map((c) => c.charCodeAt(0) - 61)];
const MIDDLE = [...[..."ASDFGHJKL"].map((c) => c.charCodeAt(0) - 61), 51];
const LOWER = [
  ...[..."ZXCVBNM"].map((c) => c.charCodeAt(0) - 61),
  54,
  55,
  82,
  229,
];

const MINIVAN_POSITIONS = [
  ...TOP.map((k, i) => ({
    width: 1,
    height: 1,
    x: i,
    y: 0,
    header: "Key Press",
    children: [<HidUsageLabel hid_usage={hid_usage_from_page_and_id(7, k)} />],
  })),
  {
    x: TOP.length,
    y: 0,
    width: 1.75,
    height: 1,
    header: "Key Press",
    children: [<HidUsageLabel hid_usage={hid_usage_from_page_and_id(7, 42)} />],
  },
  {
    x: 0,
    y: 1,
    width: 1.25,
    height: 1,
    header: "Key Press",
    children: [<span>Tab</span>],
  },
  ...MIDDLE.map((k, i) => ({
    x: i + 1.25,
    y: 1,
    width: 1,
    height: 1,
    header: "Key Press",
    children: [<HidUsageLabel hid_usage={hid_usage_from_page_and_id(7, k)} />],
  })),
  {
    x: MIDDLE.length + 1.25,
    y: 1,
    width: 1.5,
    height: 1,
    header: "Key Press",
    children: [<HidUsageLabel hid_usage={hid_usage_from_page_and_id(7, 40)} />],
  },
  {
    x: 0,
    y: 2,
    width: 1.75,
    height: 1,
    header: "Key Press",
    children: [
      <HidUsageLabel hid_usage={hid_usage_from_page_and_id(7, 225)} />,
    ],
  },
  ...LOWER.map((k, i) => ({
    x: i + 1.75,
    y: 2,
    width: 1,
    height: 1,
    header: "Key Press",
    children: [<HidUsageLabel hid_usage={hid_usage_from_page_and_id(7, k)} />],
  })),
  {
    x: 0,
    y: 3,
    width: 1.25,
    height: 1,
    header: "Key Press",
    children: [
      <HidUsageLabel hid_usage={hid_usage_from_page_and_id(7, 224)} />,
    ],
  },
  {
    x: 1.25,
    y: 3,
    width: 1.5,
    height: 1,
    header: "Key Press",
    children: [
      <HidUsageLabel hid_usage={hid_usage_from_page_and_id(7, 227)} />,
    ],
  },
  {
    x: 2.75,
    y: 3,
    width: 1.25,
    height: 1,
    header: "Key Press",
    children: [
      <HidUsageLabel hid_usage={hid_usage_from_page_and_id(7, 226)} />,
    ],
  },
  {
    x: 4,
    y: 3,
    width: 2.25,
    height: 1,
    header: "Key Press",
    children: [<span></span>],
  },
  {
    x: 6.25,
    y: 3,
    width: 2,
    height: 1,
    header: "Key Press",
    children: [<span></span>],
  },
  {
    x: 8.25,
    y: 3,
    width: 1.5,
    height: 1,
    header: "Key Press",
    children: [
      <HidUsageLabel hid_usage={hid_usage_from_page_and_id(7, 230)} />,
    ],
  },
  {
    x: 9.75,
    y: 3,
    width: 1,
    height: 1,
    header: "Key Press",
    children: [<HidUsageLabel hid_usage={hid_usage_from_page_and_id(7, 80)} />],
  },
  {
    x: 10.75,
    y: 3,
    width: 1,
    height: 1,
    header: "Key Press",
    children: [<HidUsageLabel hid_usage={hid_usage_from_page_and_id(7, 81)} />],
  },
  {
    x: 11.75,
    y: 3,
    width: 1,
    height: 1,
    header: "Key Press",
    children: [<HidUsageLabel hid_usage={hid_usage_from_page_and_id(7, 79)} />],
  },
];
const POSITIONS = MINIVAN_POSITIONS.map((k, i) => ({ ...k, id: `base-${i}` }));

export const Minivan: Story = {
  args: {
    positions: POSITIONS,
    hoverZoom: true,
  },
};

export const MiniMinivan: Story = {
  args: {
    positions: POSITIONS.map(({ id, x, y, width, height }) => ({
      id,
      x,
      y,
      width,
      height,
    })),
    oneU: 15,
    hoverZoom: false,
  },
};

// ---------------------------------------------------------------------------
// torabo-tsuki: the extension keys drawn with larger rounded corners (extensionKeys.ts).
//
// The shield appends either the hi-res dial push (1 position) or the
// 4-direction switch (5) after the standard grid, so on the L layout the round
// keys start at index 66. Coordinates are the ones in tako-custom
// boards/shields/torabo_tsuki_lp/torabo_tsuki_lp_layouts.dtsi; the 66 keycaps
// come from the same layout dump the combos/timing panel stories use.
// ---------------------------------------------------------------------------

const L_LAYOUT = toraboLayouts.find((l) => l.name === "L Layout")!;

/** `#elif TORABO_TSUKI_LP_INPUT_HIRES_DIAL`: the dial push, under the left hand. */
const DIAL_KEYS = [{ x: 300, y: 600 }];

/** `#if TORABO_TSUKI_LP_KSCAN_4_DIRECTION_SWITCH`: up, down, left, right, push. */
const FOUR_WAY_KEYS = [
  { x: 700, y: 575 },
  { x: 700, y: 775 },
  { x: 600, y: 675 },
  { x: 800, y: 675 },
  { x: 700, y: 675 },
];

/** The L layout plus an extension block, shaped the way Keymap.tsx shapes it. */
function toraboLPositions(extension: Array<{ x: number; y: number }>) {
  const keys = [
    ...L_LAYOUT.keys,
    ...extension.map(({ x, y }) => ({
      width: 100,
      height: 100,
      x,
      y,
      r: 0,
      rx: 0,
      ry: 0,
    })),
  ];
  const standard = standardKeyCount(keys.length);

  return keys.map((k, i) => ({
    id: `torabo-l-${i}`,
    x: k.x / 100,
    y: k.y / 100,
    width: k.width / 100,
    height: k.height / 100,
    r: (k.r || 0) / 100,
    rx: (k.rx || 0) / 100,
    ry: (k.ry || 0) / 100,
    shape: keyShapeAt(i, standard),
    header: "Key Press",
    children: (
      <span className="text-[10px] font-mono opacity-80">{i}</span>
    ),
  }));
}

export const ToraboTsukiLWithDial: Story = {
  args: {
    positions: toraboLPositions(DIAL_KEYS),
    oneU: 32,
    hoverZoom: true,
  },
};

export const ToraboTsukiLWithFourWaySwitch: Story = {
  args: {
    positions: toraboLPositions(FOUR_WAY_KEYS),
    oneU: 32,
    hoverZoom: true,
  },
};
