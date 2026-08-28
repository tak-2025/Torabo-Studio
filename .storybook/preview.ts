import "../src/index.css";
import type { Preview } from "@storybook/react";
import { registerBackend } from "../src/backends";
import { tauriBackend } from "../src/backends/tauri";

// The panels reach the keyboard through activeBackend() (src/backends/index.ts),
// which without a registration only accepts the desktop path once App.tsx has
// confirmed a live BLE device — a check no story can pass. Registering the tauri
// backend here routes every panel call back through window.__TAURI_INTERNALS__
// .invoke, which is exactly what each story's stubTauri() mocks, so the existing
// per-story stubs keep working unchanged. Stories that stub nothing (MainPanels
// PreConnect) are unaffected: their conn is null, so no panel calls the backend.
registerBackend(tauriBackend);

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
