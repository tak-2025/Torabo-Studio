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
  Timer,
  Cpu,
  type LucideIcon,
} from "lucide-react";

import Keyboard from "./keyboard/Keyboard";
import TrackballSettings from "./trackball/TrackballSettings";
// The v2 panel is the only trackpad panel. It reads a v1 wire too (tpConfigV2
// upgrades it on decode), so firmware from before the v2 effort still shows its
// settings; a write is rejected by that firmware, which keeps its own config.
import TrackpadSettings from "./trackpad/TrackpadSettingsV2";
import { EncoderSettings } from "./encoder/EncoderSettings";
import { LedSettings } from "./led/LedSettings";
import { TimingPanel } from "./timing/TimingPanel";
import { useToraboCaps } from "./caps/useToraboCaps";
import { FirmwareInfoPanel } from "./caps/FirmwareInfoPanel";
import { hasConfigAccess } from "./backends";
import { ConnectionContext } from "./rpc/ConnectionContext";
import { useSyncStep } from "./rpc/SyncStatusContext";
import { Feature, hasFeature, ledSides } from "./caps/toraboCaps";
import { TAB_GROUP_LABEL_CLASS, TAB_LABEL_CLASS } from "./platform/layout";
import MacrosPanel from "./dynamic_macros/MacrosPanel";
import { useAutoMacroNames } from "./dynamic_macros/useAutoMacroNames";
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
  | "timing"
  | "macros"
  | "combos"
  | "backup"
  | "fwinfo";

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

// Tab order, left to right. It is the array order and nothing else — the strip
// renders this list as it stands.
//
// The settings tabs run roughly from the hardware you touch to the keys
// themselves: pointing devices, then what a key can be made to do, then the
// light on the case. Macros and Combos sit inside that run because they are
// things you edit, not things you manage, which is also why they are in the
// "edit" group now: the group caption and its divider are drawn by comparing
// each tab with the one before it (isGroupStart below), so a group has to be
// contiguous, and putting these two between Encoder and Timing while leaving
// them in "manage" would draw the "編集 / 管理" captions three times over.
// "Manage" is now what it says: the whole-keyboard tools at the end.
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
    id: "macros",
    labelKey: "tab.macros",
    icon: Zap,
    group: "edit",
    feature: Feature.Macros,
  },
  {
    id: "combos",
    labelKey: "tab.combos",
    icon: Combine,
    group: "edit",
    feature: Feature.Combos,
  },
  {
    id: "timing",
    labelKey: "tab.timing",
    icon: Timer,
    group: "edit",
    feature: Feature.Timing,
  },
  {
    id: "led",
    labelKey: "tab.led",
    icon: Lightbulb,
    group: "edit",
    feature: Feature.Led,
  },
  { id: "backup", labelKey: "tab.backup", icon: Archive, group: "manage" },
  // No `feature`: this tab shows the descriptor itself, so it is exactly the
  // tab you want on a keyboard whose descriptor could not be read. It says so
  // instead of disappearing.
  { id: "fwinfo", labelKey: "tab.fwinfo", icon: Cpu, group: "manage" },
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
  //
  // Handed to every panel that talks to a config service, not just the ones
  // that vary their UI by it: each one also asks canWriteFeature() whether its
  // wire is one this app can still safely encode.
  //
  // The raw bytes are for the firmware-info tab alone: it is the one place that
  // shows the descriptor rather than acting on it.
  const { caps, raw: capsRaw, loading: capsLoading } = useToraboCaps();
  useSyncStep(capsLoading, "caps");

  // `&dmac N` keycaps on the keymap board (Keyboard.tsx -> Keymap.tsx) want the
  // macro slot's name as soon as it is known, not only after the user has
  // opened the マクロ tab — see dynamic_macros/useAutoMacroNames.ts. Called here
  // (rather than inside MacroNamesProvider, which wraps this component in
  // App.tsx) so it reuses THIS `caps`, from the one useToraboCaps() call above,
  // instead of running a second capability read in parallel with it.
  useAutoMacroNames(caps);

  // The config services need either the GATT backend or a working RPC tunnel
  // (setupToraboAccess in App.tsx). A connection that has neither — USB/serial
  // to firmware that predates torabo-rpc-tunnel — has the keymap and nothing
  // else, so those tabs could only fail there and go away.
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
                    className={TAB_GROUP_LABEL_CLASS}
                  >
                    {t(group.labelKey)}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className={TAB_LABEL_CLASS}>{t(tab.labelKey)}</span>
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
        <TrackballSettings caps={caps} />
      </TabPanel>
      <TabPanel id="trackpad" className="min-h-0 flex-1 overflow-hidden">
        <TrackpadSettings caps={caps} />
      </TabPanel>
      <TabPanel id="encoder" className="min-h-0 flex-1 overflow-y-auto">
        <EncoderSettings caps={caps} />
      </TabPanel>
      {/* Panels are matched to tabs by id, so this order is for the reader —
          kept the same as TABS above so the two lists can be checked off
          against each other. */}
      <TabPanel id="macros" className="min-h-0 flex-1 overflow-hidden">
        <MacrosPanel caps={caps} />
      </TabPanel>
      <TabPanel id="combos" className="min-h-0 flex-1 overflow-hidden">
        <CombosPanel caps={caps} />
      </TabPanel>
      <TabPanel id="timing" className="min-h-0 flex-1 overflow-hidden">
        <TimingPanel caps={caps} />
      </TabPanel>
      <TabPanel id="led" className="min-h-0 flex-1 overflow-y-auto">
        <LedSettings caps={caps} />
      </TabPanel>
      <TabPanel id="backup" className="min-h-0 flex-1 overflow-hidden">
        <BackupPanel />
      </TabPanel>
      <TabPanel id="fwinfo" className="min-h-0 flex-1 overflow-hidden">
        <FirmwareInfoPanel caps={caps} raw={capsRaw} loading={capsLoading} />
      </TabPanel>
    </Tabs>
  );
}

export default MainPanels;
