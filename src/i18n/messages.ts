// Lightweight i18n dictionary for Torabo Studio.
//
// Keys are dotted strings; each entry provides a Japanese (`ja`) and English
// (`en`) value. Japanese is the default language for this torabo-tsuki focused
// fork; English is available via the header language toggle.
//
// NOTE: the Trackball and Backup panels are authored Japanese-first and are not
// routed through this dictionary.

export type Lang = "ja" | "en";

export const LANGS: { id: Lang; label: string }[] = [
  { id: "ja", label: "日本語" },
  { id: "en", label: "English" },
];

type Dict = Record<string, string>;

const ja: Dict = {
  // Common
  "common.cancel": "キャンセル",
  "common.save": "保存",
  "common.close": "閉じる",
  "common.continue": "続けますか？",

  // Header
  "header.disconnect": "切断",
  "header.restoreStock": "初期設定に戻す",
  "header.restoreStockDesc":
    "設定をリセットすると、ZMK Studio で行ったカスタマイズが削除され、初期のキーマップに戻ります。",
  "tooltip.undo": "元に戻す",
  "tooltip.redo": "やり直す",
  "tooltip.save": "保存",
  "tooltip.discard": "変更を破棄",
  "lang.label": "言語",

  // Tabs
  "tab.listLabel": "パネル切り替え",
  "tab.keymap": "キーマップ",
  "tab.trackball": "トラックボール",
  "tab.trackpad": "トラックパッド",
  "tab.encoder": "エンコーダ",
  "tab.led": "LED",
  "tab.trackpadV2": "トラックパッド v2",
  "tab.macros": "マクロ",
  "tab.combos": "コンボ",
  "tab.backup": "バックアップ",
  "tabgroup.edit": "編集",
  "tabgroup.manage": "管理",

  // Footer
  "footer.about": "Torabo Studio について",
  "footer.license": "ライセンス表記",

  // Keymap editor
  "layer.layers": "レイヤー",
  "layer.newName": "新しいレイヤー名",
  "layout.label": "レイアウト",
  "scale.auto": "自動",
  "behavior.label": "動作",
  "picker.composite": "複合パラメータ",

  // Connect modal
  "connect.welcome": "Torabo Studio へようこそ",
  "connect.intro":
    "キーボードを USB または Bluetooth でつなぎます。下から接続方法を選んでください。",
  "connect.selectDevice": "デバイスを選択:",
  "connect.selectType": "接続方法を選択してください。",
  "connect.unsupportedPre":
    "お使いのブラウザは対応していません。Torabo Studio は ",
  "connect.unsupportedMid": " または ",
  "connect.unsupportedPost": "を使って ZMK デバイスに接続します。",
  "connect.note.webSerial":
    "キーマップのみ。トラックボール等の設定は Bluetooth 接続が必要です。",
  "connect.note.webBluetooth":
    "全機能。一度選べば、次回からは選択なしで前回のキーボードにつながります。",
  "connect.note.webBluetoothAll":
    "上の一覧にキーボードが出ないとき用。周囲の機器を全部表示します。",
  "connect.note.webBluetoothChoose":
    "全機能。キーボードだけを一覧に出します。接続中のキーボードは出ないため、" +
    "下の手順が必要です。",
  "connect.steps.title": "一覧にキーボードが出ないときは（Windows）",
  "connect.steps.open": "Bluetooth の接続ボタンを押して、機器の一覧を開く。",
  "connect.steps.switch":
    "キーボードのプロファイル切替キー（&bt BT_SEL）で別のプロファイルへ切り替える。" +
    "PC との接続が切れて見つけられる状態になり、一覧に torabo-tsuki が出ます。",
  "connect.steps.switchBack":
    "出てきたら、いつも使っているプロファイルに戻す。" +
    "戻さないとキーボードで操作できません（一度出た機器は、戻しても選べます）。",
  "connect.steps.select": "一覧に出たキーボードを選んで接続する。",
  "connect.toUse": "Torabo Studio を使うには、次のいずれかを行ってください:",
  "connect.useBrowser":
    "上記のウェブ技術に対応したブラウザ（Chrome / Edge など）を使う、または",
  "connect.downloadPre": "当方の",
  "connect.downloadLink": "クロスプラットフォーム版アプリ",
  "connect.downloadPost": "をダウンロードする。",

  // Unlock modal
  "unlock.title": "続けるにはロック解除してください",
  "unlock.body1":
    "セキュリティ上の理由から、ZMK Studio を使う前にキーボードのロック解除が必要です。",
  "unlock.body2Pre":
    "キーマップやコンボにスタジオのロック解除がまだ追加されていない場合は、",
  "unlock.body2Link": "Studio Unlock 動作",
  "unlock.body2Post": "のドキュメントを参照してください。",

  // About modal
  "about.intro":
    "Torabo Studio は ZMK Studio（Apache-2.0）の非公式フォークで、ZMK プロジェクトとは提携・承認関係にありません。torabo-tsuki キーボード向けにトラックボール設定タブとバックアップ機能を追加しています。",
  "about.thanks":
    "ZMK Studio は、コントリビューターの皆さんによる時間の寄付と、以下のベンダーによる資金面でのスポンサーシップによって実現しています:",

  // Visual key picker (request #2)
  "keypicker.title": "クリックでキーを割り当て",
  "keypicker.us": "US配列",
  "keypicker.jis": "JIS配列",
  "keypicker.hint":
    "下のキーをクリックすると、選択中のキーに割り当てられます。",
  "keypicker.noteUs":
    "上の「Key」欄に表示される名称はUS配列基準です（例: 2 → 「2 and @」）。",
  "keypicker.noteOs":
    "実際に入力される文字は、OS側のキーボードレイアウト（US/JIS）に依存します。JISの記号を入力するにはOSを日本語(JIS)配列に設定してください。",

  // Shared panel action bar (Trackball / Trackpad / Trackpad v2 / Macros / Combos)
  "actionBar.read": "① 読み込む",
  "actionBar.readSub": "Read",
  "actionBar.readPlain": "読み込む",
  "actionBar.write": "③ 書き込む",
  "actionBar.writeSub": "Apply + Save",

  // Collapsible help blocks
  "help.termsSummary": "❓ 用語の説明",
  "help.notesSummary": "❓ 注意事項",

  // Shared status messages (Read / Write flow across every panel)
  "status.reading": "読み込み中…",
  "status.saving": "保存中…",
  "status.loaded": "読み込みました。",
  "status.applied": "書き込みました（即反映＆本体に保存）。",
  "status.error": "エラー: ",
  "status.notConnected": "先にキーボードを Bluetooth でつないでください。",

  // Pre-connect guidance (shown when no keyboard is connected)
  "preconnect.howto":
    "表示された接続ウィンドウで USB か Bluetooth を選んでキーボードにつなぐと、この画面で設定を編集できます。",
  "preconnect.keymap":
    "この画面では、どのキーを押すと何が入力されるか（キー配置）を編集します。",
  "preconnect.trackball":
    "この画面では、トラックボールの動き（カーソル移動・スクロール・向き・速さ）をレイヤーごとに設定します。",
  "preconnect.trackpad":
    "この画面では、トラックパッドの動き（カーソル移動・スクロール・向き・感度）をレイヤーごとに設定します。",
  "preconnect.macros":
    "この画面では、よく使う操作をまとめて再生する「マクロ」を編集します。",
  "preconnect.combos":
    "この画面では、複数のキーの同時押しに 1 つの動作を割り当てる「コンボ」を編集します。",
  "preconnect.backup":
    "この画面では、キーボードの設定をファイルに保存したり、ファイルから元に戻したりします。",

  // Post-connect empty states (before the first Read)
  "empty.read": "まず青い「① 読み込む」を押すと、現在の設定が表示されます。",
  "empty.macros":
    "まず青い「読み込む」を押すと、登録済みのマクロが表示されます。",
  "empty.combos":
    "まず青い「読み込む」を押すと、登録済みのコンボが表示されます。",
};

const en: Dict = {
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.close": "Close",
  "common.continue": "Continue?",

  "header.disconnect": "Disconnect",
  "header.restoreStock": "Restore Stock Settings",
  "header.restoreStockDesc":
    "Settings reset will remove any customizations previously made in ZMK Studio and restore the stock keymap.",
  "tooltip.undo": "Undo",
  "tooltip.redo": "Redo",
  "tooltip.save": "Save",
  "tooltip.discard": "Discard",
  "lang.label": "Language",

  "tab.listLabel": "Main navigation tabs",
  "tab.keymap": "Keymap",
  "tab.trackball": "Trackball",
  "tab.trackpad": "Trackpad",
  "tab.encoder": "Encoder",
  "tab.led": "LED",
  "tab.trackpadV2": "Trackpad v2",
  "tab.macros": "Macros",
  "tab.combos": "Combos",
  "tab.backup": "Backup",
  "tabgroup.edit": "Edit",
  "tabgroup.manage": "Manage",

  "footer.about": "About Torabo Studio",
  "footer.license": "License NOTICE",

  "layer.layers": "Layers",
  "layer.newName": "New Layer Name",
  "layout.label": "Layout",
  "scale.auto": "Auto",
  "behavior.label": "Behavior",
  "picker.composite": "Some composite?",

  "connect.welcome": "Welcome to Torabo Studio",
  "connect.intro":
    "Connect your keyboard over USB or Bluetooth. Choose a connection type below.",
  "connect.selectDevice": "Select A Device:",
  "connect.selectType": "Select a connection type.",
  "connect.unsupportedPre":
    "Your browser is not supported. Torabo Studio uses either ",
  "connect.unsupportedMid": " or ",
  "connect.unsupportedPost": " to connect to ZMK devices.",
  "connect.note.webSerial":
    "Keymap only. Trackball and other settings need a Bluetooth connection.",
  "connect.note.webBluetooth":
    "Everything. After the first time, reconnects without asking again.",
  "connect.note.webBluetoothAll":
    "For when the keyboard is not in that list: shows every nearby device.",
  "connect.note.webBluetoothChoose":
    "Everything. Lists keyboards only. One that is already connected will not " +
    "be listed, so the steps below are needed.",
  "connect.steps.title": "If the keyboard is not in the list (Windows)",
  "connect.steps.open": "Press the Bluetooth button to open the device list.",
  "connect.steps.switch":
    "Press your profile-switch key (&bt BT_SEL) to move to another profile. " +
    "That disconnects it, so it becomes discoverable and appears in the list.",
  "connect.steps.switchBack":
    "Once it appears, switch back to the profile you normally use — otherwise " +
    "you cannot type. A device that has been listed stays selectable.",
  "connect.steps.select": "Pick the keyboard from the list to connect.",
  "connect.toUse": "To use Torabo Studio, either:",
  "connect.useBrowser":
    "Use a browser that supports the above web technologies, e.g. Chrome/Edge, or",
  "connect.downloadPre": "Download our ",
  "connect.downloadLink": "cross platform application",
  "connect.downloadPost": ".",

  "unlock.title": "Unlock To Continue",
  "unlock.body1":
    "For security reasons, your keyboard requires unlocking before using ZMK Studio.",
  "unlock.body2Pre":
    "If studio unlocking hasn't been added to your keymap or a combo, see the ",
  "unlock.body2Link": "Studio Unlock Behavior",
  "unlock.body2Post": " documentation for more information.",

  "about.intro":
    "Torabo Studio is an unofficial fork of ZMK Studio (Apache-2.0), not affiliated with or endorsed by the ZMK Project. It adds a Trackball settings tab and backup features for the torabo-tsuki keyboard.",
  "about.thanks":
    "ZMK Studio is made possible thanks to the generous donation of time from our contributors, as well as the financial sponsorship from the following vendors:",

  "keypicker.title": "Click to assign a key",
  "keypicker.us": "US",
  "keypicker.jis": "JIS",
  "keypicker.hint": "Click a key below to assign it to the selected key.",
  "keypicker.noteUs":
    'The name shown in the "Key" field above uses US-layout naming (e.g. 2 → "2 and @").',
  "keypicker.noteOs":
    "The character actually typed depends on your OS keyboard layout (US/JIS). To type JIS symbols, set your OS to a Japanese (JIS) layout.",

  "actionBar.read": "① Read",
  "actionBar.readSub": "Read",
  "actionBar.readPlain": "Read",
  "actionBar.write": "③ Write",
  "actionBar.writeSub": "Apply + Save",

  "help.termsSummary": "❓ Glossary",
  "help.notesSummary": "❓ Notes",

  "status.reading": "Reading…",
  "status.saving": "Saving…",
  "status.loaded": "Loaded from keyboard.",
  "status.applied": "Applied and saved to the keyboard (live).",
  "status.error": "Error: ",
  "status.notConnected": "Connect a keyboard over Bluetooth first.",

  "preconnect.howto":
    "Pick USB or Bluetooth in the connection window to link your keyboard, then you can edit here.",
  "preconnect.keymap":
    "This screen edits the key layout — what each key types when pressed.",
  "preconnect.trackball":
    "This screen sets how the trackball moves (cursor, scroll, direction, speed) for each mode.",
  "preconnect.trackpad":
    "This screen sets how the trackpad moves (cursor, scroll, direction, sensitivity) for each mode.",
  "preconnect.macros":
    "This screen edits macros — saved sequences that replay several keystrokes at once.",
  "preconnect.combos":
    "This screen edits combos — press several keys at once to trigger a single action.",
  "preconnect.backup":
    "This screen saves your keyboard settings to a file and restores them from one.",

  "empty.read": 'Press the blue "① Read" button to load the current settings.',
  "empty.macros": 'Press the blue "Read" button to load your saved macros.',
  "empty.combos": 'Press the blue "Read" button to load your saved combos.',
};

export const messages: Record<Lang, Dict> = { ja, en };
