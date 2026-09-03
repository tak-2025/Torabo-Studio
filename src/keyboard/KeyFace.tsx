/**
 * The glyph drawn on a keycap, aware of the selected US/JIS layout.
 *
 * Ported from Torabo-Float's KeyFace (FloatBoard.tsx) so the board looks the
 * same in both apps. Usages the legend table doesn't cover — everything off the
 * keyboard page, function keys, consumer controls — fall through to the
 * untouched HidUsageLabel, so this only ever adds detail.
 */
import { HidUsageLabel } from "./HidUsageLabel";
import { decodeParam, KeyLayout, lookupLegend } from "./legends";

export interface KeyFaceProps {
  /** The binding parameter holding the usage (implicit mods included). */
  usage?: number;
  /** Drawn instead of a usage: a layer name, a Bluetooth command, ... */
  text?: string;
  keyLayout: KeyLayout;
}

export const KeyFace = ({ usage, text, keyLayout }: KeyFaceProps) => {
  // Not every binding types a character. A layer name or a value name the
  // firmware reported is drawn as-is, a size down so a long one still fits.
  if (text !== undefined) {
    // whitespace-pre-line so a two-line short form renders as two lines: the
    // Bluetooth clear commands are only distinguishable ("CLR SEL" vs
    // "CLR ALL") if the distinguishing word gets its own line at this size.
    return (
      <span className="whitespace-pre-line text-center text-[0.62rem] leading-tight">
        {text}
      </span>
    );
  }

  if (usage === undefined) {
    return <span />;
  }

  const { page, id, shifted } = decodeParam(usage);
  const legend = lookupLegend(keyLayout, page, id);

  if (!legend) {
    return <HidUsageLabel hid_usage={usage} />;
  }

  let main: string;
  let sub: string | undefined;
  let showShift = false;

  if (shifted) {
    // The binding carries an implicit shift (&kp AT_SIGN, &kp LS(N2)): the shift
    // glyph is the only thing this key can type, so it gets the face alone. The
    // unshifted glyph is deliberately not drawn — it is unreachable from this
    // key, and showing it would read as a second, available legend.
    main = legend.shift ?? legend.base;
    showShift = true;
  } else {
    // Classic keycap: base big, shift face small and dim above it.
    main = legend.base;
    sub = legend.shift;
  }

  return (
    <span className="flex flex-col items-center justify-center leading-none">
      {sub && (
        <span className="text-[0.5rem] leading-none opacity-50">{sub}</span>
      )}
      <span className="leading-none">
        {main}
        {showShift && (
          <sup className="ml-px text-[0.5rem] opacity-60">⇧</sup>
        )}
      </span>
    </span>
  );
};
