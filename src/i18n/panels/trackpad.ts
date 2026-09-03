// Localized strings for the trackpad area. See src/i18n/panels/index.ts.
//
// Keys are namespaced `tp.` and belong to the trackpad panel
// (TrackpadSettingsV2.tsx).
// Strings shared with other panels (`coast.*`, `trackpad.writeScope`,
// `status.*`, `help.*`, `empty.*`) live in ../messages.ts and are reused here.
type Dict = Record<string, string>;

export const ja: Dict = {
  // Heading + the ①②③ walkthrough line. Split so the <b> emphasis on the two
  // button names survives in both languages.
  "tp.title": "トラックパッド設定",
  "tp.intro.pre": "① ",
  "tp.intro.read": "読み込む",
  "tp.intro.mid":
    "で現在値を取得 → ② 軸の機能・スワイプ動作・タップ/ジェスチャを変更 → ③ ",
  "tp.intro.write": "書き込む",
  "tp.intro.post": "で即反映＆本体に保存",

  /** Separator between a bold label and the sentence that follows it. */

  "tp.device": "デバイス",
  "tp.device.fallback": "デバイス {n}",

  // Device identity, assembled by describeDevice() in tpConfigV2.ts.
  "tp.side.left": "左",
  "tp.side.right": "右",
  "tp.conn.standard": "標準FFC",
  "tp.conn.extension": "拡張FPC",
  "tp.kind.trackpad": "トラックパッド",
  "tp.kind.trackball": "トラックボール",
  "tp.kind.encoder": "ロータリーエンコーダ",

  // Table headings (the 機能 / 向き / step ones double as the glossary terms).
  "tp.th.layer": "レイヤー",
  "tp.th.layerTitle": "レイヤー（layer）",
  "tp.th.axis": "軸",
  "tp.th.func": "機能",
  "tp.th.dir": "向き",
  "tp.th.step": "速さ・感度(step)",
  "tp.th.stepSub": "大きいほど遅い",

  // Glossary (❓ 用語の説明)
  "tp.help.func.1":
    "軸に割り当てる動作を一覧から直接選びます。カーソル移動（Move）/ スクロール（Scroll）/ 無効（Off）のほか、",
  "tp.help.func.b1": "音量・明るさ・ズーム・ブラウザ 進む戻る",
  "tp.help.func.2": "は上下スワイプのプリセットとしてワンクリックで選べます。",
  "tp.help.func.b2": "カスタム",
  "tp.help.func.3":
    "を選ぶと＋方向（上）／−方向（下）に任意の動作を割り当てられます。",
  "tp.help.swipe.dt": "スワイプ動作",
  "tp.help.swipe.pre": "",
  "tp.help.swipe.b1": "カスタム",
  "tp.help.swipe.mid1": "のとき ",
  "tp.help.swipe.b2": "＋方向（上）",
  "tp.help.swipe.mid2": "と",
  "tp.help.swipe.b3": "−方向（下）",
  "tp.help.swipe.post":
    "それぞれに 1 つの動作を割当。音量・明るさ・ズーム・ブラウザは機能の一覧から選ぶだけで自動設定されます。",
  "tp.help.media.dt": "メディアキー",
  "tp.help.media.dd":
    "メディアキー（再生/停止・音量など）は「カスタム」を選び、動作で「メディアキー（&cp）」を選ぶと一覧から選べます。",
  "tp.help.behavior.dt": "動作(behavior)",
  "tp.help.behavior.dd":
    "キー入力（&kp、修飾キー可）/ メディアキー（&cp、音量・輝度など）/ レイヤー操作（&mo・&to・&tog）/ なし（&none）",
  "tp.help.dir.dd": "reverse にチェックで逆方向（＋/−、上下、進む戻るが反転）",
  "tp.help.step.dd":
    "スクロールやカーソルの速さもここで調整します。1=最も速く敏感、数字が大きいほど遅い（最大32）。Encoder では「1操作あたりの必要移動量」",
  "tp.help.axisNote.1":
    "ミニトラックパッドは実質「縦方向」の操作です。主に ",
  "tp.help.axisNote.b": "Y 軸",
  "tp.help.axisNote.2": "に機能を割り当ててください。",

  // Swipe section
  "tp.swipe.title": "なぞる操作（スワイプ）",
  "tp.swipe.desc":
    "レイヤーごとに、横方向(X)・縦方向(Y)の動きへ機能を割り当てます（カーソル移動・スクロール・音量など）",
  "tp.expandAll": "すべて開く",
  "tp.collapseAll": "すべて閉じる",
  "tp.noLayerInfo":
    "レイヤー情報を取得できませんでした。もう一度「① 読み込む」を押してください。",
  "tp.aria.expandLayer": "レイヤー {n} を展開",
  "tp.aria.collapseLayer": "レイヤー {n} を折りたたむ",

  // Axis row labels and the axis-specific wording of the Scroll option.
  "tp.axis.x": "横方向（X）",
  "tp.axis.y": "縦方向（Y）",
  "tp.axis.x.scroll": "横スクロール（Scroll）",
  "tp.axis.y.scroll": "縦スクロール（Scroll）",

  // Flattened 機能 dropdown
  "tp.func.move": "カーソル移動（Move）",
  "tp.func.scroll": "スクロール（Scroll）",
  "tp.func.custom": "カスタム（スワイプに自由割当）",
  "tp.func.off": "無効（Off）",
  "tp.preset.volume": "音量（上下スワイプ）",
  "tp.preset.brightness": "明るさ（上下スワイプ）",
  "tp.preset.zoom": "ズーム（上下スワイプ）",
  "tp.preset.browser": "ブラウザ 進む・戻る",

  // Binding behaviors
  "tp.beh.none": "なし（&none）",
  "tp.beh.kp": "キー入力（&kp）",
  "tp.beh.cp": "メディアキー（&cp）",
  "tp.beh.mo": "押している間レイヤー切替（&mo）",
  "tp.beh.to": "レイヤー切替（&to）",
  "tp.beh.tog": "レイヤー固定/解除（&tog）",

  // Custom-encoder detail row
  "tp.encDetail.hint":
    "上下スワイプの＋方向（上）／−方向（下）にそれぞれ動作を割り当てます。メディアキーは動作で「メディアキー（&cp）」を選ぶと一覧から選べます。",
  "tp.bind.pos": "＋方向スワイプ（上）",
  "tp.bind.neg": "−方向スワイプ（下）",
  "tp.bind.noneHint":
    "動作の種類を選ぶと、キーやレイヤーの選択肢がここに表示されます",
  "tp.bind.kpHint":
    "キー名で検索（英語）するか、右端の ⌨ ボタンでキーボード画面から選べます",

  // Consumer (&cp) picker
  "tp.cp.placeholder": "選んでください…",
  "tp.cp.other": "その他（一覧から選ぶ）…",
  "tp.cp.playPause": "再生/一時停止",
  "tp.cp.next": "次の曲",
  "tp.cp.prev": "前の曲",
  "tp.cp.stop": "停止",
  "tp.cp.mute": "ミュート",
  "tp.cp.volUp": "音量を上げる",
  "tp.cp.volDn": "音量を下げる",
  "tp.cp.briUp": "明るさを上げる",
  "tp.cp.briDn": "明るさを下げる",
  "tp.cp.back": "ブラウザ戻る",
  "tp.cp.forward": "ブラウザ進む",
  "tp.cp.home": "ホーム",
  "tp.cp.search": "検索",
  "tp.cp.calc": "電卓",

  // Gestures card
  "tp.gest.title": "たたく操作（タップ / ジェスチャ）",
  "tp.gest.desc":
    "レイヤーごとに、単タップ・ダブルタップ・2本指タップ・長押しへ任意の動作を割当。未設定（&none）ならドライバ既定（タップ=左クリック / 2本指=右クリック）を素通しします。ダブルタップを設定すると単タップは判定待ちのため少し遅延します。長押しは指を約0.35秒押したままにすると発火し、指を離すまで保持します（&mo でレイヤー保持など）。スクロールやカーソル移動は上の「なぞる操作（スワイプ）」で設定します。",
  "tp.gest.layer": "レイヤー {n}",
  "tp.gest.layerName": "（{name}）",
  "tp.gest.tap": "単タップ",
  "tp.gest.dtap": "ダブルタップ",
  "tp.gest.tap2": "2本指タップ",
  "tp.gest.hold": "長押し（hold）",

  "tp.writeNote":
    "書き込みは即反映され、本体に保存されます。空・不正な設定は必ず通常のカーソル移動／ドライバ既定クリックに戻ります。",

  // 書き込むと、ファームウェアが二度と読み出せなくなる設定（デバイス3台以上）。
  // 書き込み自体は成功してしまうので、アプリ側で止めるしかない。
  "tp.blocked.readbackTooBig":
    "この設定はキーボードに書き込めません。ファームウェアが読み出しに使える上限は {max} バイトですが、" +
    "この内容は書き込むと {size} バイトになり、以後この設定を読み出せなくなります" +
    "（読み出せないと書き換えもできなくなります）。書き込みを中止しました。",

};

export const en: Dict = {
  "tp.title": "Trackpad Settings",
  "tp.intro.pre": "① ",
  "tp.intro.read": "Read",
  "tp.intro.mid":
    " the current values → ② Change axis functions, swipe actions and tap/gestures → ③ ",
  "tp.intro.write": "Write",
  "tp.intro.post": " to apply live and save to the keyboard",

  "tp.device": "Device",
  "tp.device.fallback": "Device {n}",

  "tp.side.left": "Left",
  "tp.side.right": "Right",
  "tp.conn.standard": "Standard FFC",
  "tp.conn.extension": "Extension FPC",
  "tp.kind.trackpad": "Trackpad",
  "tp.kind.trackball": "Trackball",
  "tp.kind.encoder": "Rotary encoder",

  "tp.th.layer": "Layer",
  "tp.th.layerTitle": "Layer",
  "tp.th.axis": "Axis",
  "tp.th.func": "Function",
  "tp.th.dir": "Direction",
  "tp.th.step": "Speed / sensitivity (step)",
  "tp.th.stepSub": "Higher is slower",

  "tp.help.func.1":
    "Pick what an axis does straight from the list. Alongside Move, Scroll and Off, ",
  "tp.help.func.b1": "Volume, Brightness, Zoom and Browser back/forward",
  "tp.help.func.2":
    " are one-click presets for an up/down swipe. Choose ",
  "tp.help.func.b2": "Custom",
  "tp.help.func.3":
    " to assign any action to the + (up) and − (down) directions.",
  "tp.help.swipe.dt": "Swipe action",
  "tp.help.swipe.pre": "With ",
  "tp.help.swipe.b1": "Custom",
  "tp.help.swipe.mid1": ", ",
  "tp.help.swipe.b2": "+ (up)",
  "tp.help.swipe.mid2": " and ",
  "tp.help.swipe.b3": "− (down)",
  "tp.help.swipe.post":
    " each take one action. Volume, brightness, zoom and browser are filled in for you as soon as you pick them from the function list.",
  "tp.help.media.dt": "Media keys",
  "tp.help.media.dd":
    "For media keys (play/pause, volume and so on) choose Custom, then pick “Media key (&cp)” as the behavior to get the list.",
  "tp.help.behavior.dt": "Behavior",
  "tp.help.behavior.dd":
    "Key press (&kp, modifiers allowed) / media key (&cp, volume, brightness, …) / layer control (&mo, &to, &tog) / none (&none)",
  "tp.help.dir.dd":
    "Tick reverse to flip the direction (+/−, up/down, forward/back).",
  "tp.help.step.dd":
    "Cursor and scroll speed are set here too. 1 = fastest and most sensitive; higher is slower (max 32). For Encoder it is how far you must swipe per step.",
  "tp.help.axisNote.1":
    "The mini trackpad is really a vertical control, so assign functions mainly to the ",
  "tp.help.axisNote.b": "Y axis",
  "tp.help.axisNote.2": ".",

  "tp.swipe.title": "Swipe",
  "tp.swipe.desc":
    "Assign a function to horizontal (X) and vertical (Y) movement, per layer — cursor, scroll, volume and so on.",
  "tp.expandAll": "Expand all",
  "tp.collapseAll": "Collapse all",
  "tp.noLayerInfo":
    "Could not read the layer information. Press “① Read” again.",
  "tp.aria.expandLayer": "Expand layer {n}",
  "tp.aria.collapseLayer": "Collapse layer {n}",

  "tp.axis.x": "Horizontal (X)",
  "tp.axis.y": "Vertical (Y)",
  "tp.axis.x.scroll": "Horizontal scroll",
  "tp.axis.y.scroll": "Vertical scroll",

  "tp.func.move": "Cursor (Move)",
  "tp.func.scroll": "Scroll",
  "tp.func.custom": "Custom (assign your own)",
  "tp.func.off": "Off",
  "tp.preset.volume": "Volume (swipe up/down)",
  "tp.preset.brightness": "Brightness (swipe up/down)",
  "tp.preset.zoom": "Zoom (swipe up/down)",
  "tp.preset.browser": "Browser back/forward",

  "tp.beh.none": "None (&none)",
  "tp.beh.kp": "Key press (&kp)",
  "tp.beh.cp": "Media key (&cp)",
  "tp.beh.mo": "Momentary layer (&mo)",
  "tp.beh.to": "Switch layer (&to)",
  "tp.beh.tog": "Toggle layer (&tog)",

  "tp.encDetail.hint":
    "Assign an action to each swipe direction, + (up) and − (down). For media keys, pick “Media key (&cp)” as the behavior to get the list.",
  "tp.bind.pos": "Swipe + (up)",
  "tp.bind.neg": "Swipe − (down)",
  "tp.bind.noneHint":
    "Pick a behavior type and the key or layer options appear here.",
  "tp.bind.kpHint":
    "Search by key name, or use the ⌨ button on the right to pick from a keyboard view.",

  "tp.cp.placeholder": "Choose…",
  "tp.cp.other": "Other (pick from the full list)…",
  "tp.cp.playPause": "Play/Pause",
  "tp.cp.next": "Next track",
  "tp.cp.prev": "Previous track",
  "tp.cp.stop": "Stop",
  "tp.cp.mute": "Mute",
  "tp.cp.volUp": "Volume up",
  "tp.cp.volDn": "Volume down",
  "tp.cp.briUp": "Brightness up",
  "tp.cp.briDn": "Brightness down",
  "tp.cp.back": "Browser back",
  "tp.cp.forward": "Browser forward",
  "tp.cp.home": "Home",
  "tp.cp.search": "Search",
  "tp.cp.calc": "Calculator",

  "tp.gest.title": "Taps and gestures",
  "tp.gest.desc":
    "Assign any action to a single tap, double tap, two-finger tap or hold, per layer. Left unset (&none), the driver defaults pass through (tap = left click, two fingers = right click). Setting a double tap delays the single tap slightly while it waits to decide. A hold fires after about 0.35 s and stays held until you lift your finger — &mo to hold a layer, for example. Scrolling and cursor movement are set under Swipe above.",
  "tp.gest.layer": "Layer {n}",
  "tp.gest.layerName": " ({name})",
  "tp.gest.tap": "Single tap",
  "tp.gest.dtap": "Double tap",
  "tp.gest.tap2": "Two-finger tap",
  "tp.gest.hold": "Hold",

  "tp.writeNote":
    "A write applies immediately and is saved to the keyboard. An empty or invalid setting always falls back to plain cursor movement and the driver's default clicks.",

  "tp.blocked.readbackTooBig":
    "This configuration cannot be written to the keyboard. Its firmware can read " +
    "back at most {max} bytes, but writing this would make the settings {size} " +
    "bytes, after which they could never be read back — and settings that cannot " +
    "be read can no longer be changed. The write was cancelled.",

};
