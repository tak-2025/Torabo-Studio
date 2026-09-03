// Localized strings for the trackball area. See src/i18n/panels/index.ts.
//
// Keys are namespaced `tb.`. The inertial-scroll copy (`coast.*`) is shared
// with the trackpad panel and lives in messages.ts, not here.
type Dict = Record<string, string>;

export const ja: Dict = {
  // Panel header. The step line is split so the <b> emphasis survives:
  //   {pre} <b>{read}</b>{mid} <b>{write}</b>{post}
  "tb.title": "トラックボール設定",
  "tb.steps.pre": "①",
  "tb.steps.read": "読み込む",
  "tb.steps.mid": "で現在値を取得 → ② 表の値を変更 → ③",
  "tb.steps.write": "書き込む",
  "tb.steps.post": "で即反映＆保存",

  // Temporary layer switch card
  "tb.temp.title": "一時レイヤー切替（ボール操作で切替）",
  "tb.temp.target": "切替先レイヤー",
  "tb.temp.timeout": "戻る時間（ms, 50〜30000）",

  // Glossary / table headings (shared between the <details> list and the table)
  "tb.term.layer": "レイヤー（layer）",
  "tb.term.role": "動作",
  "tb.term.roleDesc":
    "Move=カーソル移動 / Scroll=スクロール / Off=無効（その軸を止める）",
  "tb.term.dir": "向き",
  "tb.term.dirDesc": "reverse にチェックで逆方向",
  "tb.term.speed": "速度(÷)",
  "tb.term.speedDesc": "1=最速、数字が大きいほど遅い（最大32）",
  "tb.term.temp": "一時レイヤー",
  "tb.term.tempDesc":
    "✓のレイヤーでボールを動かすと、上の「切替先レイヤー」へ一時的に切替（レイヤー＝Fnキーのように切り替わるキー配置のセット）",

  // Table
  "tb.th.layer": "レイヤー",
  "tb.th.axis": "軸",
  "tb.th.slower": "大きいほど遅い",

  // Axis roles (ROLE_LABEL_KEYS in ztcConfig.ts)
  "tb.role.move": "カーソル移動（Move）",
  "tb.role.scroll": "スクロール（Scroll）",
  "tb.role.off": "無効（Off）",

  "tb.writeNote":
    "書き込みは即反映され、本体に保存されます。空・不正な設定は必ず通常のカーソル移動に戻ります" +
    "（カーソルが止まることはありません）。既定値は元の挙動（レイヤー0/1=移動、2=横スクロール、3=縦スクロール）。",

  // Codec errors (thrown from ztcConfig.ts, shown in the status line)
  "tb.err.size": "トラックボール設定のサイズが不正です（{size} B）",
  "tb.err.sizeV": "トラックボール設定のサイズが不正です（{size} B, v{version}）",
  "tb.err.magic":
    "マジックが不正です 0x{magic}（ファームウェアとアプリの不一致）",
  "tb.err.version":
    "非対応の設定バージョン {version}（対応は {v2} または {v3}）",
};

export const en: Dict = {
  "tb.title": "Trackball Settings",
  "tb.steps.pre": "①",
  "tb.steps.read": "Read",
  "tb.steps.mid": "loads the current values → ② edit the table → ③",
  "tb.steps.write": "Write",
  "tb.steps.post": " applies and saves it instantly",

  "tb.temp.title": "Temporary layer switch (moving the ball switches)",
  "tb.temp.target": "Target layer",
  "tb.temp.timeout": "Return delay (ms, 50–30000)",

  "tb.term.layer": "Layer",
  "tb.term.role": "Action",
  "tb.term.roleDesc":
    "Move = cursor / Scroll = scrolling / Off = disabled (stops that axis)",
  "tb.term.dir": "Direction",
  "tb.term.dirDesc": "Tick reverse to invert the axis",
  "tb.term.speed": "Speed (÷)",
  "tb.term.speedDesc": "1 = fastest; bigger is slower (max 32)",
  "tb.term.temp": "Temporary layer",
  "tb.term.tempDesc":
    "Moving the ball on a ticked layer switches temporarily to the target layer chosen above (a layer is a swappable set of key assignments, like an Fn key).",

  "tb.th.layer": "Layer",
  "tb.th.axis": "Axis",
  "tb.th.slower": "bigger is slower",

  "tb.role.move": "Move (cursor)",
  "tb.role.scroll": "Scroll",
  "tb.role.off": "Off (disabled)",

  "tb.writeNote":
    "A write applies immediately and is saved to the keyboard. An empty or invalid setting always falls back to plain cursor movement, so the cursor never stops responding. The defaults match the original behaviour (layers 0/1 = move, 2 = horizontal scroll, 3 = vertical scroll).",

  "tb.err.size": "Unexpected trackball config size {size} B",
  "tb.err.sizeV": "Unexpected trackball config size {size} B (v{version})",
  "tb.err.magic": "Bad magic 0x{magic} (firmware/app mismatch)",
  "tb.err.version":
    "Unsupported config version {version} (expected {v2} or {v3})",
};
