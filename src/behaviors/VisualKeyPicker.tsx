import { useMemo } from "react";
import { useLocalStorageState } from "../misc/useLocalStorageState";
import { hid_usage_from_page_and_id } from "../hid-usages";
import { useT } from "../i18n";
import { JIS_LAYOUT, KeyDef, KeyLayout, US_LAYOUT } from "./keyLayouts";

export interface VisualKeyPickerProps {
  /** Current binding value (may include implicit modifiers in the top byte). */
  value?: number;
  onValueChanged: (value?: number) => void;
}

type LayoutId = "us" | "jis";

const LAYOUTS: Record<LayoutId, KeyLayout> = {
  us: US_LAYOUT,
  jis: JIS_LAYOUT,
};

// The HID Keyboard/Keypad page; same page used by `&kp`.
const KEYBOARD_PAGE = 0x07;

/**
 * A clickable QWERTY keyboard for assigning a key without hunting through the
 * dropdown. Switchable between US and JIS legends. Clicking a key sets the base
 * usage while preserving any implicit modifiers already on the binding.
 */
export const VisualKeyPicker = ({
  value,
  onValueChanged,
}: VisualKeyPickerProps) => {
  const t = useT();
  const [layoutId, setLayoutId] = useLocalStorageState<LayoutId>(
    "visualKeyLayout",
    "us"
  );

  // The currently selected usage id, if it lives on the keyboard page.
  const selectedUsageId = useMemo(() => {
    if (value === undefined) return undefined;
    const base = value & 0xffffff;
    const page = (base >> 16) & 0xff;
    if (page !== KEYBOARD_PAGE) return undefined;
    return base & 0xffff;
  }, [value]);

  const handleClick = (key: KeyDef) => {
    // Preserve implicit modifier flags stored in the top byte.
    const mods = value ? value & 0xff000000 : 0;
    const next =
      (mods | hid_usage_from_page_and_id(KEYBOARD_PAGE, key.usage)) >>> 0;
    onValueChanged(next);
  };

  const layout = LAYOUTS[layoutId];

  return (
    <div className="flex flex-col gap-1 mt-2 p-2 rounded bg-base-200/60 border border-base-300 select-none">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold">{t("keypicker.title")}</span>
        <div className="flex rounded overflow-hidden border border-base-300 text-xs">
          {(["us", "jis"] as LayoutId[]).map((l) => (
            <button
              key={l}
              type="button"
              className={
                "px-2 py-0.5 " +
                (layoutId === l
                  ? "bg-primary text-primary-content"
                  : "bg-base-100 hover:bg-base-300")
              }
              onClick={() => setLayoutId(l)}
            >
              {t(l === "us" ? "keypicker.us" : "keypicker.jis")}
            </button>
          ))}
        </div>
        <span className="text-xs text-base-content/60">{t("keypicker.hint")}</span>
      </div>
      <div className="mb-1 flex flex-col gap-0.5 rounded bg-base-300/40 px-2 py-1 text-xs text-base-content/70 leading-relaxed">
        <span>※ {t("keypicker.noteUs")}</span>
        <span>※ {t("keypicker.noteOs")}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        {layout.map((row, ri) => (
          <div key={ri} className="flex gap-0.5">
            {row.map((key, ki) => {
              const selected = key.usage === selectedUsageId;
              return (
                <button
                  key={ki}
                  type="button"
                  title={key.label}
                  onClick={() => handleClick(key)}
                  style={{ flexGrow: key.w ?? 1, flexBasis: 0 }}
                  className={
                    "relative h-9 min-w-0 rounded text-xs flex items-center justify-center border transition-colors " +
                    (selected
                      ? "bg-primary text-primary-content border-primary"
                      : "bg-base-100 border-base-300 hover:bg-base-300")
                  }
                >
                  {key.sub && (
                    <span className="absolute top-0.5 right-1 text-[0.6rem] opacity-60 leading-none">
                      {key.sub}
                    </span>
                  )}
                  <span className="truncate px-0.5">{key.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
