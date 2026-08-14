import { useContext } from "react";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import {
  Keyboard as KeyboardIcon,
  Mouse,
  Touchpad,
  Zap,
  Combine,
  Archive,
  RotateCw,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";

import Keyboard from "./keyboard/Keyboard";
import TrackballSettings from "./trackball/TrackballSettings";
// V2 routed by user choice (2026-07-11) while the v2 effort is in progress:
// READ works against the current (pre-flash) v1 firmware (the v2 codec
// upgrades v1 wire), WRITE is rejected by it until the v2 FW is flashed
// (fail-safe: the firmware keeps its config). The v1 panel stays available:
// import TrackpadSettings from "./trackpad/TrackpadSettings";
import TrackpadSettings from "./trackpad/TrackpadSettingsV2";
import { EncoderSettings } from "./encoder/EncoderSettings";
import { LedSettings } from "./led/LedSettings";
import { useToraboCaps } from "./caps/useToraboCaps";
import { hasConfigAccess } from "./backends";
import { ConnectionContext } from "./rpc/ConnectionContext";
import { Feature, hasFeature, ledSides } from "./caps/toraboCaps";
import MacrosPanel from "./dynamic_macros/MacrosPanel";
import CombosPanel from "./dynamic_combos/CombosPanel";
import BackupPanel from "./backup/BackupPanel";
import { useT } from "./i18n";
import { useLocalStorageState } from "./misc/useLocalStorageState";

type Panel =
  | "keyboard"
  | "trackball"
  | "trackpad"
  | "encoder"
  | "led"
  | "macros"
  | "combos"
  | "backup";

type TabGroupId = "edit" | "manage";

interface TabDef {
  id: Panel;
  labelKey: string;
  icon: LucideIcon;
  group: TabGroupId;
  /**
   * Which firmware feature backs this tab. A torabo build is assembled from
   * snippets, so the keyboard on the other end may simply not have it — we ask the
   * firmware (see caps/toraboCaps.ts) rather than offering a tab that can only
   * fail. Tabs with no `feature` are always available (they don't need one).
   */
  feature?: Feature;
}

const TABS: TabDef[] = [
  { id: "keyboard", labelKey: "tab.keymap", icon: KeyboardIcon, group: "edit" },
  {
    id: "trackball",
    labelKey: "tab.trackball",
    icon: Mouse,
    group: "edit",
    feature: Feature.Trackball,
  },
  {
    id: "trackpad",
    labelKey: "tab.trackpad",
    icon: Touchpad,
    group: "edit",
    feature: Feature.Trackpad,
  },
  {
    id: "encoder",
    labelKey: "tab.encoder",
    icon: RotateCw,
    group: "edit",
    feature: Feature.Encoder,
  },
  {
    id: "led",
    labelKey: "tab.led",
    icon: Lightbulb,
    group: "edit",
    feature: Feature.Led,
  },
  {
    id: "macros",
    labelKey: "tab.macros",
    icon: Zap,
    group: "manage",
    feature: Feature.Macros,
  },
  {
    id: "combos",
    labelKey: "tab.combos",
    icon: Combine,
    group: "manage",
    feature: Feature.Combos,
  },
  { id: "backup", labelKey: "tab.backup", icon: Archive, group: "manage" },
];

const GROUPS: { id: TabGroupId; labelKey: string }[] = [
  { id: "edit", labelKey: "tabgroup.edit" },
  { id: "manage", labelKey: "tabgroup.manage" },
];

const DEFAULT_PANEL: Panel = "keyboard";

function isPanelId(value: string): value is Panel {
  return TABS.some((tab) => tab.id === value);
}

// Active: primary underline (via ::after) + primary text + primary icon.
// Inactive: muted text, brightens on hover. Keyboard focus gets a visible ring.
//
// NOTE: react-aria-components' <TabList> discards whatever JSX it is given
// and instead renders a flat collection of <Tab> items (built by walking the
// whole subtree in a hidden/portaled pass). Wrapping <Tab> elements in plain
// <div> group-wrapper elements breaks that collection walk (verified: it
// renders an empty tablist). So the two tab groups ("edit"/"manage") are
// visually separated per-tab instead: a left border divider plus a small
// group caption on the first tab of each group, rather than a wrapping div.
const tabBaseClass =
  "group relative flex items-end gap-1.5 px-2.5 sm:px-3 py-2 rounded-t " +
  "cursor-pointer outline-none whitespace-nowrap font-semibold " +
  "text-base-content/60 rac-hover:text-base-content rac-selected:text-primary " +
  "rac-focus-visible:ring-2 rac-focus-visible:ring-primary rac-focus-visible:ring-offset-1 " +
  "after:absolute after:left-1.5 after:right-1.5 after:-bottom-px after:h-0.5 " +
  "after:rounded-full after:bg-transparent rac-selected:after:bg-primary";

function isGroupStart(tabs: TabDef[], index: number): boolean {
  return index === 0 || tabs[index].group !== tabs[index - 1].group;
}

/**
 * Main content area: tabs between the stock keymap editor and the
 * torabo-tsuki trackball / trackpad settings panels (custom GATT services),
 * plus the macro, combo and backup panels.
 */
export function MainPanels() {
  const t = useT();
  const [panel, setPanel] = useLocalStorageState<Panel>(
    "torabo.mainTab",
    DEFAULT_PANEL,
    { deserialize: (v) => (isPanelId(v) ? (v as Panel) : DEFAULT_PANEL) },
  );

  // What this particular firmware can do. null while loading, and for firmware
  // that predates the descriptor — in both cases hasFeature() answers "maybe",
  // so we show everything rather than hide a tab we simply couldn't ask about.
  const { caps } = useToraboCaps();

  // The config services are GATT-only, so a browser talking Web Serial has the
  // keymap and nothing else — those tabs could only fail there, so they go away.
  // Only once connected, though: before that every panel shows its own "connect
  // first" note, and hiding them would take away the one hint of what this
  // keyboard can do. The backup tab always stays — it degrades section by
  // section and reports what it had to skip.
  const { conn } = useContext(ConnectionContext);
  const configReachable = !conn || hasConfigAccess();

  const visibleTabs = TABS.filter((tab) => {
    if (!tab.feature) return true;
    if (!configReachable) return false;
    if (!hasFeature(caps, tab.feature)) return false;
    // The LED's anode rides the extender pad's power rail, so a build can have the
    // module compiled in while neither half actually has a working LED. The
    // firmware tells us which halves are real; if it's neither, there is nothing
    // to configure.
    if (tab.feature === Feature.Led && caps) {
      const { left, right } = ledSides(caps);
      return left || right;
    }
    return true;
  });

  // The remembered tab may not exist on THIS keyboard (or the firmware changed
  // under us). Fall back rather than render a tab with no panel behind it.
  const activePanel = visibleTabs.some((tb) => tb.id === panel)
    ? panel
    : DEFAULT_PANEL;

  return (
    <Tabs
      selectedKey={activePanel}
      onSelectionChange={(key) => setPanel(key as Panel)}
      className="flex flex-col min-h-0 overflow-hidden"
    >
      <TabList
        aria-label={t("tab.listLabel")}
        className="flex items-stretch gap-1 px-3 pt-2 shrink-0 border-b-2 border-primary bg-base-200/40 overflow-x-auto"
      >
        {visibleTabs.map((tab, i) => {
          const Icon = tab.icon;
          const groupStart = isGroupStart(visibleTabs, i);
          // Divider before every group after the first; caption above the
          // first tab of each group (both skipped for the very first tab).
          const dividerClass =
            i > 0 && groupStart ? "ml-2 pl-3 border-l border-base-300" : "";
          const group = GROUPS.find((g) => g.id === tab.group)!;

          return (
            <Tab
              key={tab.id}
              id={tab.id}
              aria-label={t(tab.labelKey)}
              className={`${tabBaseClass} ${dividerClass}`}
            >
              <span className="flex flex-col gap-0.5" title={t(tab.labelKey)}>
                {groupStart && (
                  <span
                    aria-hidden="true"
                    className="hidden sm:block text-[10px] leading-none font-semibold uppercase tracking-wider text-base-content/40"
                  >
                    {t(group.labelKey)}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="hidden sm:inline">{t(tab.labelKey)}</span>
                </span>
              </span>
            </Tab>
          );
        })}
      </TabList>
      <TabPanel id="keyboard" className="min-h-0 flex-1 overflow-hidden">
        <Keyboard />
      </TabPanel>
      <TabPanel id="trackball" className="min-h-0 flex-1 overflow-hidden">
        <TrackballSettings />
      </TabPanel>
      <TabPanel id="trackpad" className="min-h-0 flex-1 overflow-hidden">
        <TrackpadSettings />
      </TabPanel>
      <TabPanel id="encoder" className="min-h-0 flex-1 overflow-y-auto">
        <EncoderSettings />
      </TabPanel>
      <TabPanel id="led" className="min-h-0 flex-1 overflow-y-auto">
        <LedSettings />
      </TabPanel>
      <TabPanel id="macros" className="min-h-0 flex-1 overflow-hidden">
        <MacrosPanel />
      </TabPanel>
      <TabPanel id="combos" className="min-h-0 flex-1 overflow-hidden">
        <CombosPanel />
      </TabPanel>
      <TabPanel id="backup" className="min-h-0 flex-1 overflow-hidden">
        <BackupPanel />
      </TabPanel>
    </Tabs>
  );
}

export default MainPanels;
