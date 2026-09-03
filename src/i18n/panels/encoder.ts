// Localized strings for the encoder area. See src/i18n/panels/index.ts.
type Dict = Record<string, string>;

export const ja: Dict = {
  // Intro (the emphasis is a <b> in the JSX, hence the pre/strong/post split)
  "enc.intro.pre": "ロータリーエンコーダの",
  "enc.intro.strong": "右回し・左回し・押し込み",
  "enc.intro.post": "を、レイヤーごとに割り当てます。",
  "enc.note.pre": "エンコーダはキーマップ上のキーではないため、",
  "enc.note.strong1": "キー位置を消費しません",
  "enc.note.mid": "。",
  "enc.note.strong2": "書き込む",
  "enc.note.post": "で即反映＆本体に保存されます（再ビルド不要）。",

  // Per-layer card
  "enc.layerN": "レイヤー {n}",
  "enc.field.rotation": "回転の機能",
  "enc.preset.custom": "カスタム（個別に割当）",

  // Rotation presets
  "enc.preset.volume": "音量",
  "enc.preset.brightness": "画面の明るさ",
  "enc.preset.track": "曲送り / 曲戻し",
  "enc.preset.zoom": "ズーム (Ctrl +/-)",
  "enc.preset.page": "ページ送り (PgUp/PgDn)",
  "enc.preset.updown": "上下キー",
  "enc.preset.leftright": "左右キー",
  "enc.preset.browser": "ブラウザ 進む / 戻る",

  // Slots
  "enc.slot.cw": "右回し",
  "enc.slot.ccw": "左回し",
  "enc.slot.btn": "押し込み",

  // Binding editor
  "enc.field.kind": "種類",
  "enc.field.key": "キー",
  "enc.field.consumer": "メディア操作",
  "enc.field.mods": "修飾キー",
  "enc.field.layer": "レイヤー",
  "enc.beh.none": "なし",
  "enc.beh.kp": "キー (&kp)",
  "enc.beh.cp": "メディア (&cp)",
  "enc.beh.mo": "レイヤー押下中 (&mo)",
  "enc.beh.to": "レイヤー切替 (&to)",
  "enc.beh.tog": "レイヤートグル (&tog)",

  // Accessible names
  "enc.aria.behavior": "種類",
  "enc.aria.layer": "レイヤー",
  "enc.aria.preset": "レイヤー {n} の回転の機能",

  // Read / write status

  // Wire decode errors
  "enc.err.short": "エンコーダ設定が短すぎます（{n} B）",
  "enc.err.magic": "エンコーダ設定: マジックが不正です 0x{magic}",
  "enc.err.version": "エンコーダ設定: 非対応のバージョン {version}",
  "enc.err.truncated":
    "エンコーダ設定が途中で切れています: {got} B、{need} B必要です",
};

export const en: Dict = {
  "enc.intro.pre": "Assign what the rotary encoder does when you ",
  "enc.intro.strong": "turn it either way or press it in",
  "enc.intro.post": ", layer by layer.",
  "enc.note.pre": "The encoder is not a key in the keymap, so it ",
  "enc.note.strong1": "costs no key position",
  "enc.note.mid": ". ",
  "enc.note.strong2": "Write",
  "enc.note.post":
    " applies changes live and saves them to the keyboard — no rebuild needed.",

  "enc.layerN": "Layer {n}",
  "enc.field.rotation": "Rotation",
  "enc.preset.custom": "Custom (assign each one)",

  "enc.preset.volume": "Volume",
  "enc.preset.brightness": "Screen brightness",
  "enc.preset.track": "Next / previous track",
  "enc.preset.zoom": "Zoom (Ctrl +/-)",
  "enc.preset.page": "Page up / down (PgUp/PgDn)",
  "enc.preset.updown": "Arrow up / down",
  "enc.preset.leftright": "Arrow left / right",
  "enc.preset.browser": "Browser forward / back",

  "enc.slot.cw": "Turn right",
  "enc.slot.ccw": "Turn left",
  "enc.slot.btn": "Press",

  "enc.field.kind": "Type",
  "enc.field.key": "Key",
  "enc.field.consumer": "Media control",
  "enc.field.mods": "Modifiers",
  "enc.field.layer": "Layer",
  "enc.beh.none": "None",
  "enc.beh.kp": "Key (&kp)",
  "enc.beh.cp": "Media (&cp)",
  "enc.beh.mo": "Layer while held (&mo)",
  "enc.beh.to": "Switch layer (&to)",
  "enc.beh.tog": "Toggle layer (&tog)",

  "enc.aria.behavior": "behavior",
  "enc.aria.layer": "layer",
  "enc.aria.preset": "rotation preset layer {n}",


  "enc.err.short": "encoder config too short ({n} B)",
  "enc.err.magic": "encoder config: bad magic 0x{magic}",
  "enc.err.version": "encoder config: unsupported version {version}",
  "enc.err.truncated": "encoder config truncated: {got} B, need {need}",
};
