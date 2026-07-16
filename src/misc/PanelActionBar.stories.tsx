import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { PanelActionBar, StatusBadge, type PanelStatus } from "./PanelActionBar";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
//
// PanelActionBar/StatusBadge are purely presentational and call useT(), whose
// context (src/i18n/index.tsx) provides a default value (lang: "ja", a real
// translate fn) even without an <I18nProvider> ancestor, so no decorator is
// needed here (verified against src/i18n/index.tsx's createContext default).
const meta = {
  title: "Misc/PanelActionBar",
  component: PanelActionBar,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {},
  args: {
    onRead: fn(),
    onWrite: fn(),
    status: { kind: "idle" } satisfies PanelStatus,
  },
} satisfies Meta<typeof PanelActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: {
    status: { kind: "idle" },
  },
};

export const Busy: Story = {
  args: {
    status: { kind: "busy", msg: "読み込み中..." },
  },
};

export const Ok: Story = {
  args: {
    status: { kind: "ok", msg: "保存しました。" },
  },
};

export const ErrorState: Story = {
  args: {
    status: { kind: "error", msg: "接続が失われました。" },
  },
};

export const WithoutWriteButton: Story = {
  args: {
    onWrite: undefined,
    status: { kind: "idle" },
  },
};

export const WithChildButtons: Story = {
  args: {
    status: { kind: "idle" },
    children: (
      <>
        <button type="button" className="btn btn-secondary btn-sm">
          keymap から取り込み
        </button>
        <button type="button" className="btn btn-accent btn-sm">
          取り込んだ2件を保存
        </button>
      </>
    ),
  },
};

// --- StatusBadge (sub-component of the same module) ------------------------

const statusMeta = {
  title: "Misc/StatusBadge",
  component: StatusBadge,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof StatusBadge>;

type StatusStory = StoryObj<typeof statusMeta>;

export const StatusIdle: StatusStory = {
  args: { status: { kind: "idle" } },
};

export const StatusBusy: StatusStory = {
  args: { status: { kind: "busy", msg: "書き込み中..." } },
};

export const StatusOk: StatusStory = {
  args: { status: { kind: "ok", msg: "書き込みました。" } },
};

export const StatusError: StatusStory = {
  args: { status: { kind: "error", msg: "書き込みに失敗しました。" } },
};
