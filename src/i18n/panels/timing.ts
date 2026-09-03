// Localized strings for the timing area. See src/i18n/panels/index.ts.
//
// Keys are namespaced `tm.`. The shared messages.ts already owns `timing.*`
// (the two debounce split notes) — those are reused from there rather than
// duplicated here, so nothing shadows anything.
type Dict = Record<string, string>;

export const ja: Dict = {
  // Panel header
  "tm.title": "タップ反応設定",
  "tm.subtitle":
    "Hold-Tap（mt / lt）の判定時間とキーボードのデバウンス時間を、再ビルドなしで調整します。",
  "tm.ht.desc":
    "mt（&mt / mod_tap）と lt（&lt / layer_tap）はノード単位の設定です。" +
    "キーマップでそれぞれを使っている全てのキーに一括で反映されます（キーごとの個別設定はできません）。",
  "tm.writeNote":
    "書き込みは即反映され、本体に保存されます。Hold-Tap は次の押下から新しい設定で判定されます。",

  // Hold-Tap nodes (HT_NODE_LABEL_KEYS in timingConfig.ts)
  "tm.node.mt": "mt（Mod-Tap）",
  "tm.node.lt": "lt（Layer-Tap）",

  // Presets (HT_PRESETS[].labelKey)
  "tm.preset": "プリセット",
  "tm.preset.custom": "カスタム",
  "tm.preset.standard": "標準",
  "tm.preset.rollSafe": "ロール誤爆防止",
  "tm.preset.homeRowMods": "ホームロウモッド",

  // Per-node tunables
  "tm.advanced": "詳細設定",
  "tm.tappingTerm": "tapping-term（長押しと判定するまでの時間）",
  "tm.flavor": "flavor（判定方式）",
  "tm.flavor.holdPreferred": "ホールド優先（hold-preferred）",
  "tm.flavor.balanced": "バランス（balanced）",
  "tm.flavor.tapPreferred": "タップ優先（tap-preferred）",
  "tm.flavor.tapUnlessInterrupted":
    "妨害されなければタップ（tap-unless-interrupted）",
  "tm.quickTap.enable": "quick-tap を有効にする",
  "tm.quickTapMs": "quick-tap-ms（直前のタップから連打とみなす時間）",
  "tm.priorIdle.enable": "require-prior-idle を有効にする",
  "tm.priorIdleMs":
    "require-prior-idle-ms（直前に何も押していない状態が必要な時間）",

  // positional block
  "tm.positional": "positional（位置による判定調整）",
  "tm.retroTap":
    "retro-tap（ホールドと判定された後に単独で離した場合、タップとして送る）",
  "tm.holdTriggerOnRelease":
    "hold-trigger-on-release（他のキーが離されるまでホールド判定を待つ）",
  "tm.holdWhileUndecided":
    "hold-while-undecided（判定中は他のキー送信を保留する）",
  "tm.positions": "hold-trigger-key-positions（対象キー位置）",
  "tm.positions.hint":
    "ここに挙げたキー位置と同時に押されたときだけホールドを優先します（未選択なら無効）。",

  // Key-position picker
  "tm.pos.none": "未選択（無効）",
  "tm.pos.pickLayout": "レイアウトで選ぶ",
  "tm.pos.hideLayout": "レイアウトを閉じる",
  "tm.pos.addByNumber": "番号で追加",
  "tm.aria.removePos": "位置 {n} を削除",
  "tm.aria.addPosByNumber": "{id} 番号で位置を追加",
  "tm.aria.preset": "{node} preset",
  "tm.aria.flavor": "{node} flavor",

  // Debounce
  "tm.debounce.title": "デバウンス",
  "tm.debounce.desc":
    "キーのチャタリング防止時間です。数字が大きいほど誤入力は減りますが、反応がわずかに遅くなります。",
  "tm.debounce.press": "press（押下時）",
  "tm.debounce.release": "release（離した時）",

  // Codec errors (thrown from timingConfig.ts, shown in the status line)
  "tm.err.size": "タイミング設定: {expected} バイトのはずが {got} バイトでした",
  "tm.err.version": "タイミング設定: 非対応のバージョン {version}",
};

export const en: Dict = {
  "tm.title": "Tap Response Settings",
  "tm.subtitle":
    "Tune Hold-Tap (mt / lt) timing and the keyboard's debounce time without rebuilding the firmware.",
  "tm.ht.desc":
    "mt (&mt / mod_tap) and lt (&lt / layer_tap) are per-node settings. " +
    "They apply at once to every key in the keymap that uses them — there is no per-key override.",
  "tm.writeNote":
    "A write applies immediately and is saved to the keyboard. Hold-Tap uses the new values from the next press.",

  "tm.node.mt": "mt (Mod-Tap)",
  "tm.node.lt": "lt (Layer-Tap)",

  "tm.preset": "Preset",
  "tm.preset.custom": "Custom",
  "tm.preset.standard": "Standard",
  "tm.preset.rollSafe": "Roll-safe",
  "tm.preset.homeRowMods": "Home row mods",

  "tm.advanced": "Advanced",
  "tm.tappingTerm": "tapping-term (how long a press must last to count as a hold)",
  "tm.flavor": "flavor (how the decision is made)",
  "tm.flavor.holdPreferred":
    "hold-preferred (holds as soon as another key is pressed)",
  "tm.flavor.balanced":
    "balanced (holds if another key is pressed and released)",
  "tm.flavor.tapPreferred": "tap-preferred (holds only after the tapping term)",
  "tm.flavor.tapUnlessInterrupted":
    "tap-unless-interrupted (taps unless another key interrupts)",
  "tm.quickTap.enable": "Enable quick-tap",
  "tm.quickTapMs":
    "quick-tap-ms (a re-press within this long after a tap repeats the tap)",
  "tm.priorIdle.enable": "Enable require-prior-idle",
  "tm.priorIdleMs":
    "require-prior-idle-ms (how long nothing may be pressed before this key)",

  "tm.positional": "positional (adjust the decision by key position)",
  "tm.retroTap":
    "retro-tap (if the key is released on its own after a hold was decided, send the tap)",
  "tm.holdTriggerOnRelease":
    "hold-trigger-on-release (wait for the other key to be released before deciding hold)",
  "tm.holdWhileUndecided":
    "hold-while-undecided (hold back other keys while the decision is pending)",
  "tm.positions": "hold-trigger-key-positions (key positions to watch)",
  "tm.positions.hint":
    "Hold only wins when one of the key positions listed here is pressed at the same time (none listed = off).",

  "tm.pos.none": "None selected (off)",
  "tm.pos.pickLayout": "Pick on layout",
  "tm.pos.hideLayout": "Close layout",
  "tm.pos.addByNumber": "Add by number",
  "tm.aria.removePos": "Remove position {n}",
  "tm.aria.addPosByNumber": "{id} add position by number",
  "tm.aria.preset": "{node} preset",
  "tm.aria.flavor": "{node} flavor",

  "tm.debounce.title": "Debounce",
  "tm.debounce.desc":
    "How long chatter is ignored on a key. Higher values cut misfires but make the key feel slightly slower.",
  "tm.debounce.press": "press (on press)",
  "tm.debounce.release": "release (on release)",

  "tm.err.size": "timing config: expected {expected} bytes, got {got}",
  "tm.err.version": "timing config: unsupported version {version}",
};
