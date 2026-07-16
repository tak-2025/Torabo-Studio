import type { Meta, StoryObj } from "@storybook/react";
import { MainPanels } from "./MainPanels";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
//
// MainPanels renders the tab bar (react-aria-components Tabs) plus all six
// settings panels. None of them require a provider to mount in isolation:
// - ConnectionContext (src/rpc/ConnectionContext.ts) defaults to { conn: null }
// - LockStateContext (src/rpc/LockStateContext.ts) defaults to LOCKED
// - UndoRedoContext (src/undoRedo.ts) defaults to null
// Every panel's data-fetching hook (useConnectedDeviceData, Keyboard's
// useBehaviors, etc.) treats a null `conn` as "not connected yet" and shows
// its pre-connect guidance instead of throwing, so this story renders the
// same pre-connect state the real app shows before a keyboard is attached.
//
// useT() (src/i18n/index.tsx) also has a working default context value
// (lang: "ja") without an <I18nProvider> ancestor, so no decorator is added.
const meta = {
  title: "Application/MainPanels",
  component: MainPanels,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {},
  args: {},
} satisfies Meta<typeof MainPanels>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PreConnect: Story = {
  args: {},
  decorators: [
    (Story) => (
      <div style={{ height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
};
