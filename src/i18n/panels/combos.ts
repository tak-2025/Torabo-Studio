// Localized strings for the combos area. See src/i18n/panels/index.ts.
//
// This panel deliberately calls a keymap layer a "モード" (mode) in its
// user-facing copy — keep that wording in both languages.
type Dict = Record<string, string>;

export const ja: Dict = {
  // Header
  "cb.title": "ダイナミックコンボ",
  "cb.desc":
    "複数のキー位置を同時押しすると 1 つの動作（キー入力・モード切替・マクロ）を発火します。キー位置の番号は keymap のキー位置（0 始まり）です。空 or 無効のコンボは何も起きません。",

  // Slot list
  "cb.none":
    "登録済みのコンボはありません。下の「＋ コンボを追加」で作成できます。",
  "cb.add": "コンボを追加",

  // Slot editor
  "cb.slotTitle": "コンボ {idx}",
  "cb.disabledSuffix": " （無効）",
  "cb.enabled": "有効",

  // Key positions
  "cb.keyPositions": "キー位置",
  "cb.unselected": "未選択",
  "cb.removePos": "位置 {pos} を削除",
  "cb.closeLayout": "レイアウトを閉じる",
  "cb.pickLayout": "レイアウトで選ぶ",
  "cb.addByNumberAria": "番号で位置を追加",
  "cb.addByNumber": "番号で追加",
  "cb.needTwo": "コンボには 2 つ以上のキー位置が必要です（最大 {max}）。",

  // Target behavior
  "cb.action": "発火する動作",
  "cb.target.kp": "キー入力 (kp)",
  "cb.target.mo": "押している間モード切替 (mo)",
  "cb.target.to": "モード切替 (to)",
  "cb.target.tog": "モード固定/解除 (tog)",
  "cb.target.dmac": "マクロ (&dmac)",
  "cb.macroSlot": "マクロ slot",
  "cb.modeNumber": "モード番号",

  // Timing
  "cb.timeout": "タイムアウト",
  "cb.timeoutZeroTitle": "同時押しと認識する制限時間。0 だと発火しません",
  "cb.timeoutZeroFix": "0だと発火しません → 50ms",
  "cb.priorIdle": "直前アイドル",

  // Layer (mode) mask
  "cb.modeTitle": "レイヤー（layer）",
  "cb.activeModes": "有効モード",
  "cb.allModes": "全モード",

  // Status messages
  "cb.writing": "コンボ {idx} を書き込み中…",
  "cb.saved": "コンボ {idx} を保存しました（次のアイドルで反映＆本体に保存）。",
};

export const en: Dict = {
  "cb.title": "Dynamic Combos",
  "cb.desc":
    "Press several key positions at once to fire a single action (key press, mode switch, or macro). Position numbers are the keymap's key positions, starting at 0. An empty or disabled combo does nothing.",

  "cb.none": 'No combos yet. Use "+ Add combo" below to create one.',
  "cb.add": "Add combo",

  "cb.slotTitle": "Combo {idx}",
  "cb.disabledSuffix": " (disabled)",
  "cb.enabled": "Enabled",

  "cb.keyPositions": "Key positions",
  "cb.unselected": "None selected",
  "cb.removePos": "Remove position {pos}",
  "cb.closeLayout": "Close layout",
  "cb.pickLayout": "Pick on layout",
  "cb.addByNumberAria": "Add a position by number",
  "cb.addByNumber": "Add by number",
  "cb.needTwo": "A combo needs at least 2 key positions (up to {max}).",

  "cb.action": "Action to fire",
  "cb.target.kp": "Key press (kp)",
  "cb.target.mo": "Momentary mode (mo)",
  "cb.target.to": "Switch mode (to)",
  "cb.target.tog": "Toggle mode (tog)",
  "cb.target.dmac": "Macro (&dmac)",
  "cb.macroSlot": "Macro slot",
  "cb.modeNumber": "Mode number",

  "cb.timeout": "Timeout",
  "cb.timeoutZeroTitle":
    "How far apart the presses may be and still count as simultaneous. 0 never fires.",
  "cb.timeoutZeroFix": "0 never fires → 50ms",
  "cb.priorIdle": "Prior idle",

  "cb.modeTitle": "Layer",
  "cb.activeModes": "Active modes",
  "cb.allModes": "All modes",

  "cb.writing": "Writing combo {idx}…",
  "cb.saved":
    "Combo {idx} saved (takes effect at the next idle, stored on the keyboard).",
};
