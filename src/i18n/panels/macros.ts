// Localized strings for the macros area. See src/i18n/panels/index.ts.
type Dict = Record<string, string>;

export const ja: Dict = {
  // Header
  "mac.title": "ダイナミックマクロ",
  // The description wraps a <code>&dmac 0</code> tag, so it is split in two.
  // `mac.desc2` continues the sentence right after the tag — English needs a
  // leading space there, Japanese does not.
  "mac.desc1": "各スロットに「キーを順に入力する手順」を登録します。keymap 側で",
  "mac.desc2":
    "等を置いたキーで再生されます。修飾子チェックは「そのキーを押す間だけ」効きます（例 Ctrl+C）。",

  // Action bar
  "mac.import": "keymap.keymap から取り込み",
  "mac.saveImported": "取り込んだ {n} 件を保存",

  // Slot list
  "mac.none":
    "登録済みのマクロはありません。下の「＋ マクロを追加」で作成できます。",
  "mac.add": "マクロを追加",
  "mac.emptySlot": "空（何もしない）",

  // Slot name (macros wire v2 only — hidden on firmware without names)
  "mac.name": "名前",
  "mac.namePlaceholder": "未設定（盤面では M{idx} と表示）",
  "mac.nameLimit": "UTF-8 {max} バイトまで",

  // Step editor
  "mac.step": "ステップ",
  "mac.stepAction": "動作",
  "mac.removeStep": "ステップを削除",

  // Status messages
  "mac.writing": "Slot {idx} を書き込み中…",
  "mac.saved": "Slot {idx} を保存しました（即反映＆本体に保存）。",
  "mac.slotFailed": "Slot {idx} で失敗: {err}",
  "mac.savedImportedCount": "取り込んだ {n} スロットを保存しました。",

  // keymap.keymap import
  "mac.noMacrosNode": "macros ノードが見つかりませんでした。",
  "mac.imported":
    "{n} 件取り込み（Slot {slots}）。内容を確認して保存してください。",
  "mac.warnPrefix": "注意: ",
  "mac.warn.noFreeSlot": "スロット不足: {name} を入れられません",
  "mac.warn.tooManySteps": "{name}: ステップが{max}個を超え切り捨て",
  "mac.warn.unknownKey": "未対応キー: &kp {arg}",
  "mac.warn.unknownBehavior": "未対応の動作: &{tok}",
};

export const en: Dict = {
  "mac.title": "Dynamic Macros",
  "mac.desc1":
    "Each slot holds a sequence of keystrokes, played back by a key bound to",
  "mac.desc2":
    " (and so on) in your keymap. A step's modifier checkboxes apply only while that step's key is held (e.g. Ctrl+C).",

  "mac.import": "Import from keymap.keymap",
  "mac.saveImported": "Save {n} imported",

  "mac.none": 'No macros yet. Use "+ Add macro" below to create one.',
  "mac.add": "Add macro",
  "mac.emptySlot": "Empty (does nothing)",

  "mac.name": "Name",
  "mac.namePlaceholder": "Unnamed (shown as M{idx} on the board)",
  "mac.nameLimit": "up to {max} UTF-8 bytes",

  "mac.step": "Step",
  "mac.stepAction": "Action",
  "mac.removeStep": "Remove step",

  "mac.writing": "Writing Slot {idx}…",
  "mac.saved": "Slot {idx} saved (applied live and stored on the keyboard).",
  "mac.slotFailed": "Slot {idx} failed: {err}",
  "mac.savedImportedCount": "Saved {n} imported slot(s).",

  "mac.noMacrosNode": "No macros node found in that file.",
  "mac.imported":
    "Imported {n} into Slot {slots}. Check the contents, then save.",
  "mac.warnPrefix": "Note: ",
  "mac.warn.noFreeSlot": "No free slot: {name} could not be imported",
  "mac.warn.tooManySteps": "{name}: more than {max} steps, extras dropped",
  "mac.warn.unknownKey": "Unsupported key: &kp {arg}",
  "mac.warn.unknownBehavior": "Unsupported behavior: &{tok}",
};
