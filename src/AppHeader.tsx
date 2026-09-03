import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import { useConnectedDeviceData } from "./rpc/useConnectedDeviceData";
import { useSub } from "./usePubSub";
import { useContext, useEffect, useState } from "react";
import { useModalRef } from "./misc/useModalRef";
import { LockStateContext } from "./rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { ConnectionContext } from "./rpc/ConnectionContext";
import {
  ALargeSmall,
  ChevronDown,
  Info,
  Keyboard,
  Languages,
  Loader2,
  Redo2,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { Tooltip } from "./misc/Tooltip";
import { GenericModal } from "./GenericModal";
import { useI18n, LANGS } from "./i18n";
import { KEY_LAYOUTS, useKeyLayout } from "./keyboard/KeyLayoutContext";
import { UI_SCALES, useUiScale } from "./misc/useUiScale";
import { useCurrentSyncStep } from "./rpc/SyncStatusContext";
import { syncStepLabelKey } from "./rpc/syncStatus";

export interface AppHeaderProps {
  connectedDeviceLabel?: string;
  /** Touch builds only: the footer is hidden there, so its two links live
   *  behind the header's ⓘ button instead. */
  onShowAbout?: () => void;
  onShowLicenseNotice?: () => void;
  onSave?: () => void | Promise<void>;
  onDiscard?: () => void | Promise<void>;
  onUndo?: () => Promise<void>;
  onRedo?: () => Promise<void>;
  onResetSettings?: () => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  canUndo?: boolean;
  canRedo?: boolean;
}

export const AppHeader = ({
  connectedDeviceLabel,
  canRedo,
  canUndo,
  onRedo,
  onUndo,
  onSave,
  onDiscard,
  onDisconnect,
  onResetSettings,
  onShowAbout,
  onShowLicenseNotice,
}: AppHeaderProps) => {
  const [showSettingsReset, setShowSettingsReset] = useState(false);

  const { lang, setLang, t } = useI18n();
  const { keyLayout, setKeyLayout } = useKeyLayout();
  const { scale: uiScale, cycle: cycleUiScale } = useUiScale();
  const lockState = useContext(LockStateContext);
  const connectionState = useContext(ConnectionContext);
  // The one connect-time read still running, or null once they've all
  // settled — see rpc/SyncStatusContext for who reports into this.
  const syncStep = useCurrentSyncStep();

  useEffect(() => {
    if (
      (!connectionState.conn ||
        lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) &&
      showSettingsReset
    ) {
      setShowSettingsReset(false);
    }
  }, [lockState, showSettingsReset]);

  const showSettingsRef = useModalRef(showSettingsReset);
  const [unsaved, setUnsaved] = useConnectedDeviceData<boolean>(
    { keymap: { checkUnsavedChanges: true } },
    (r) => r.keymap?.checkUnsavedChanges
  );

  useSub("rpc_notification.keymap.unsavedChangesStatusChanged", (unsaved) =>
    setUnsaved(unsaved)
  );

  return (
    <header className="top-0 left-0 right-0 grid grid-cols-[1fr_auto_1fr] items-center justify-between h-10 max-w-full">
      <div className="flex px-3 items-center gap-1">
        <img src={`${import.meta.env.BASE_URL}torabo.svg`} alt="Torabo Studio Logo" className="h-8 rounded" />
        <p className="font-semibold">Torabo Studio</p>
      </div>
      <GenericModal ref={showSettingsRef} className="max-w-[50vw]">
        <h2 className="my-2 text-lg">{t("header.restoreStock")}</h2>
        <div>
          <p>{t("header.restoreStockDesc")}</p>
          <p>{t("common.continue")}</p>
          <div className="flex justify-end my-2 gap-3">
            <Button
              className="rounded bg-base-200 hover:bg-base-300 px-3 py-2"
              onPress={() => setShowSettingsReset(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="rounded bg-base-200 hover:bg-base-300 px-3 py-2"
              onPress={() => {
                setShowSettingsReset(false);
                onResetSettings?.();
              }}
            >
              {t("header.restoreStock")}
            </Button>
          </div>
        </div>
      </GenericModal>
      <div className="flex items-center gap-2 min-w-0">
        <MenuTrigger>
          <Button
            className="text-center rac-disabled:opacity-0 hover:bg-base-300 transition-all duration-100 p-1 pl-2 rounded-lg pointer-coarse:py-2.5"
            isDisabled={!connectedDeviceLabel}
          >
            {connectedDeviceLabel}
            <ChevronDown className="inline-block w-4" />
          </Button>
          <Popover>
            <Menu className="shadow-md rounded bg-base-100 text-base-content cursor-pointer overflow-hidden">
              <MenuItem
                className="px-2 py-1 hover:bg-base-200 pointer-coarse:py-3"
                onAction={onDisconnect}
              >
                {t("header.disconnect")}
              </MenuItem>
              <MenuItem
                className="px-2 py-1 hover:bg-base-200 pointer-coarse:py-3"
                onAction={() => setShowSettingsReset(true)}
              >
                {t("header.restoreStock")}
              </MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
        {/* Unobtrusive: text + a spinner, no layout reserved for it while
            idle, gone the moment the last connect-time read settles. */}
        {syncStep && (
          <span
            role="status"
            className="flex items-center gap-1 text-xs text-base-content/60 whitespace-nowrap"
          >
            <Loader2 className="inline-block w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            {t(syncStepLabelKey(syncStep))}
          </span>
        )}
      </div>
      {/*
        The `pointer-coarse:` padding bumps throughout this header exist only to
        raise these controls to a 44px tap target on touch screens (PLAN.md
        stage 4). They are pure media-query additions, so the desktop/Tauri
        build renders exactly as before.
      */}
      <div className="flex justify-end items-center gap-1 px-2">
        {/* Touch only: a phone, a Fold and a tablet each want a different text
            size, and the desktop build has a window the user can already
            resize. pointer-fine:hidden keeps it out of the PC header. */}
        {(onShowAbout || onShowLicenseNotice) && (
          <MenuTrigger>
            <Button className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 pointer-coarse:p-2.5 pointer-fine:hidden">
              <Info className="inline-block w-4" aria-label={t("footer.about")} />
            </Button>
            <Popover>
              <Menu className="shadow-md rounded bg-base-100 text-base-content cursor-pointer overflow-hidden">
                <MenuItem
                  className="px-2 py-1 hover:bg-base-200 pointer-coarse:py-3"
                  onAction={onShowAbout}
                >
                  {t("footer.about")}
                </MenuItem>
                <MenuItem
                  className="px-2 py-1 hover:bg-base-200 pointer-coarse:py-3"
                  onAction={onShowLicenseNotice}
                >
                  {t("footer.license")}
                </MenuItem>
              </Menu>
            </Popover>
          </MenuTrigger>
        )}
        <Tooltip label={t("uiscale.label")}>
          <Button
            className="flex items-center justify-center gap-1 p-1.5 rounded enabled:hover:bg-base-300 pointer-coarse:p-2.5 pointer-fine:hidden"
            onPress={cycleUiScale}
          >
            <ALargeSmall
              className="inline-block w-4"
              aria-label={t("uiscale.label")}
            />
            <span className="text-xs font-semibold whitespace-nowrap">
              {UI_SCALES.find((s) => s.id === uiScale)?.label}
            </span>
          </Button>
        </Tooltip>
        <Tooltip label={`${t("keylayout.label")} — ${t("keylayout.desc")}`}>
          <Button
            className="flex items-center justify-center gap-1 p-1.5 rounded enabled:hover:bg-base-300 pointer-coarse:p-2.5"
            onPress={() =>
              setKeyLayout(
                KEY_LAYOUTS[
                  (KEY_LAYOUTS.findIndex((l) => l.id === keyLayout) + 1) %
                    KEY_LAYOUTS.length
                ].id
              )
            }
          >
            <Keyboard
              className="inline-block w-4"
              aria-label={t("keylayout.label")}
            />
            <span className="text-xs font-semibold whitespace-nowrap">
              {KEY_LAYOUTS.find((l) => l.id === keyLayout)?.label}
            </span>
          </Button>
        </Tooltip>
        <Tooltip label={t("lang.label")}>
          <Button
            className="flex items-center justify-center gap-1 p-1.5 rounded enabled:hover:bg-base-300 pointer-coarse:p-2.5"
            onPress={() =>
              setLang(
                LANGS[(LANGS.findIndex((l) => l.id === lang) + 1) % LANGS.length]
                  .id
              )
            }
          >
            <Languages className="inline-block w-4" aria-label={t("lang.label")} />
            <span className="text-xs font-semibold whitespace-nowrap">
              {LANGS.find((l) => l.id === lang)?.label}
            </span>
          </Button>
        </Tooltip>
        {onUndo && (
          <Tooltip label={t("tooltip.undo")}>
            <Button
              className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 disabled:opacity-50 pointer-coarse:p-2.5"
              isDisabled={!canUndo}
              onPress={onUndo}
            >
              <Undo2 className="inline-block w-4 mx-1" aria-label={t("tooltip.undo")} />
            </Button>
          </Tooltip>
        )}

        {onRedo && (
          <Tooltip label={t("tooltip.redo")}>
            <Button
              className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 disabled:opacity-50 pointer-coarse:p-2.5"
              isDisabled={!canRedo}
              onPress={onRedo}
            >
              <Redo2 className="inline-block w-4 mx-1" aria-label={t("tooltip.redo")} />
            </Button>
          </Tooltip>
        )}
        <Tooltip label={t("tooltip.save")}>
          <Button
            className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 disabled:opacity-50 pointer-coarse:p-2.5"
            isDisabled={!unsaved}
            onPress={onSave}
          >
            <Save className="inline-block w-4 mx-1" aria-label={t("tooltip.save")} />
          </Button>
        </Tooltip>
        <Tooltip label={t("tooltip.discard")}>
          <Button
            className="flex items-center justify-center p-1.5 rounded enabled:hover:bg-base-300 disabled:opacity-50 pointer-coarse:p-2.5"
            onPress={onDiscard}
            isDisabled={!unsaved}
          >
            <Trash2 className="inline-block w-4 mx-1" aria-label={t("tooltip.discard")} />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
};
