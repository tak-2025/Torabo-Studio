// Lightweight i18n dictionary for Torabo Studio.
//
// Keys are dotted strings; each entry provides a Japanese (`ja`) and English
// (`en`) value. Japanese is the default language for this torabo-tsuki focused
// fork; English is available via the header language toggle.
//
// Panel-specific copy lives in ./panels/*.ts, one file per settings panel, and
// is merged in below. This file keeps what is shared across the whole app.
//
// A derivative target's own strings (see PLAN-translators.md §2.5) are merged
// in last, from ../platform/messages — see that file's header comment.

import { panelEn, panelJa } from "./panels";
import { platformMessages } from "../platform/messages";

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
  // A bold label followed by its explanation. Japanese needs no space around
  // the full-width colon; English needs one after it.
  "common.labelSep": "：",
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
  "connect.failed": "選んだ機器に接続できませんでした。",
  "connect.failedUsb":
    "USB でキーボードが応答しません。\n\n" +
    "よくある原因: キーボードの出力先が Bluetooth になっています。ZMK は" +
    "「そのとき選択されている出力先」でしか Studio の通信に応答しないため、" +
    "USB ケーブルが繋がっていても、出力先が Bluetooth なら USB では応答しません。\n\n" +
    "対処:\n" +
    "・PC の Bluetooth を切る（USB が唯一の出力先になり、そのまま繋がります）\n" +
    "・またはキーマップに割り当てた &out（Output Selection）キーで USB に切り替える\n\n" +
    "この設定はキーボード側に保存され、キーマップを変えても残ります。",
  "lang.label": "言語",
  "keylayout.label": "表示用のキー配列",
  "keylayout.desc":
    "キーキャップに描く記号を、OS のキーボードレイアウトに合わせます。キーボードが送るキーコードは変わりません。",

  // Tabs
  "tab.listLabel": "パネル切り替え",
  "tab.keymap": "キーマップ",
  "tab.trackball": "トラックボール",
  "tab.trackpad": "トラックパッド",
  "tab.encoder": "エンコーダ",
  "tab.led": "LED",
  "tab.timing": "タップ反応",
  "tab.trackpadV2": "トラックパッド",
  "tab.macros": "マクロ",
  "tab.combos": "コンボ",
  "tab.backup": "バックアップ",
  "tab.fwinfo": "FW情報",
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
  "connect.unsupportedPre":
    "お使いのブラウザは対応していません。Torabo Studio は ",
  "connect.unsupportedMid": " または ",
  "connect.unsupportedPost": "を使って ZMK デバイスに接続します。",
  "connect.note.webSerial":
    "ファームウェアがトンネル対応なら全機能。" +
    "旧ファームウェアではキーマップのみで、トラックボール等の設定は Bluetooth 接続が必要です。",
  "connect.note.usbExclusive":
    "キーボードと通信できるのは USB でも Bluetooth でも一度に 1 つのアプリだけです。" +
    "Torabo-Float など他のアプリを使っている場合は、閉じてから接続してください。",
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
    "Torabo Studio は ZMK Studio（Apache-2.0）の非公式フォークで、ZMK プロジェクトとは提携・承認関係にありません。torabo-tsuki キーボード向けに、トラックボール・トラックパッド・エンコーダ・LED・タップ反応の各設定タブとバックアップ機能、日本語 UI を追加し、BLE / USB のどちらでもライブ編集できます。",
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
  "actionBar.writeBlocked":
    "キーボードのファームウェアがこのアプリより新しいため、" +
    "設定が壊れるのを防ぐために書き込みを無効にしています。" +
    "読み込み（確認）はできます。アプリを更新してください。",

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

  // Initial-sync status line (SyncStatusContext / AppHeader) — the handful of
  // reads that run automatically right after connecting, before the keymap
  // board and the tabs' capability gating have settled. Order matches
  // syncStatus.ts's SYNC_STEP_ORDER.
  "sync.step.keymap": "キーマップを読み込み中…",
  "sync.step.caps": "機能一覧を確認中…",
  "sync.step.macroNames": "マクロ名を読み込み中…",

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
  "preconnect.timing":
    "この画面では、Hold-Tap（mt / lt）の判定時間とキーボードのデバウンス時間を編集します。",
  "preconnect.backup":
    "この画面では、キーボードの設定をファイルに保存したり、ファイルから元に戻したりします。",
  "preconnect.fwinfo":
    "この画面では、つないだキーボードの ext_FW（torabo 拡張ファームウェア）のバージョンと、入っている機能の一覧を確認できます。",

  // Timing — どちらの注記を出すかは caps の TimingCap.SplitDebounce で決まる。
  // 左右どちらが central かに関係なく正しい文言になるよう、半身の呼び名は使わない。
  "timing.debounce.bothHalves":
    "左右どちらの半身にも反映されます（設定は接続のたびに中央側からもう一方へ送られます）。",
  "timing.debounce.centralOnly":
    "このファームウェアでは中央（central）半身 — このキーボードでは右手側 — のみに反映されます。左半身（split peripheral）のデバウンスには届きません。",

  // 慣性スクロール（coast）— トラックパッド／トラックボール共通。
  // firmware の caps（TP_COAST / ZTC_COAST）が立っていないときは coast.unavailable。
  "coast.title": "慣性スクロール",
  "coast.desc":
    "スクロールを止めた後も、勢いに応じてしばらく滑り続けます（スマホや実トラックパッドと同じ感触）。スクロール（Scroll）を割り当てた軸にだけ効きます。",
  "coast.enable": "慣性スクロールを有効にする",
  "coast.friction": "滑走の長さ",
  "coast.frictionHint":
    "小さいほど長く滑ります。1＝数秒 / 8＝標準（約0.8秒）/ 32＝ほぼ即停止。",
  "coast.threshold": "開始しきい値",
  "coast.thresholdHint":
    "この速さより遅い操作では滑りません（単位＝ホイールの刻み／秒）。既定 24。大きくすると、勢いよく弾いたときだけ滑ります。",
  "coast.thresholdUnit": "刻み/秒",
  "coast.note":
    "滑走中に次の操作をすると、その場ですぐ止まります。レイヤーを離れても滑走はそのまま続きます。",
  "coast.perDevice":
    "この設定はデバイスごとです（上で選んだデバイスに保存されます）。",
  "coast.unavailable":
    "このファームウェアは慣性スクロールに対応していません。使うにはファームウェアの更新が必要です。",

  // トラックパッド設定画面の下部バナー。以前は「それぞれ個別に保存されます」と
  // 書いていたが、実装は常に全デバイス分の設定をひとつの blob にまとめて一括
  // 書き込みしており、デバイスごとの個別保存ではない。文言を実装に合わせた。
  "trackpad.writeScope":
    "デバイスは上のプルダウンで切り替えます。書き込みは全デバイスまとめて保存されます。",

  // Touch builds only (see misc/useUiScale.ts): the header's text-size cycle
  // button, and the label shown when the behavior list has not arrived yet
  // (src/keyboard/Keyboard.tsx's fixed key-editor sheet).
  "uiscale.label": "文字サイズ",
  "behavior.unavailable":
    "キーボードから動作の一覧を取得できていません。切断して、つなぎ直してください。",

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
  "common.labelSep": ": ",
  "common.continue": "Continue?",

  "header.disconnect": "Disconnect",
  "header.restoreStock": "Restore Stock Settings",
  "header.restoreStockDesc":
    "Settings reset will remove any customizations previously made in ZMK Studio and restore the stock keymap.",
  "tooltip.undo": "Undo",
  "tooltip.redo": "Redo",
  "tooltip.save": "Save",
  "tooltip.discard": "Discard",
  "connect.failed": "Failed to connect to the chosen device.",
  "connect.failedUsb":
    "The keyboard is not answering over USB.\n\n" +
    "Most likely cause: its output is set to Bluetooth. ZMK only answers Studio " +
    "on the output endpoint that is currently selected, so with the output on " +
    "Bluetooth it will not answer over USB even with the cable plugged in.\n\n" +
    "What to do:\n" +
    "- Turn off Bluetooth on this PC (USB then becomes the only endpoint)\n" +
    "- Or switch the output to USB with an &out (Output Selection) key\n\n" +
    "This setting is stored on the keyboard and survives keymap changes.",
  "lang.label": "Language",
  "keylayout.label": "Legend layout",
  "keylayout.desc":
    "Draws keycap glyphs to match your OS keyboard layout. The keycodes the keyboard sends are unchanged.",

  "tab.listLabel": "Main navigation tabs",
  "tab.keymap": "Keymap",
  "tab.trackball": "Trackball",
  "tab.trackpad": "Trackpad",
  "tab.encoder": "Encoder",
  "tab.led": "LED",
  "tab.timing": "Tap Response",
  "tab.trackpadV2": "Trackpad",
  "tab.macros": "Macros",
  "tab.combos": "Combos",
  "tab.backup": "Backup",
  "tab.fwinfo": "Firmware",
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
  "connect.unsupportedPre":
    "Your browser is not supported. Torabo Studio uses either ",
  "connect.unsupportedMid": " or ",
  "connect.unsupportedPost": " to connect to ZMK devices.",
  "connect.note.webSerial":
    "Everything, on firmware that has the settings tunnel. On older firmware, " +
    "keymap only — trackball and other settings then need Bluetooth.",
  "connect.note.usbExclusive":
    "The keyboard talks to one app at a time, over USB and Bluetooth alike. " +
    "Close Torabo-Float (or any other app using it) before connecting.",
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
    "Torabo Studio is an unofficial fork of ZMK Studio (Apache-2.0), not affiliated with or endorsed by the ZMK Project. It adds Trackball, Trackpad, Encoder, LED and Tap Response settings tabs, backup features, and a Japanese UI for the torabo-tsuki keyboard, live-editable over BLE or USB.",
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
  "actionBar.writeBlocked":
    "This keyboard's firmware is newer than this app, so writing is disabled " +
    "to avoid damaging its settings. Reading still works. Please update the app.",

  "help.termsSummary": "❓ Glossary",
  "help.notesSummary": "❓ Notes",

  "status.reading": "Reading…",
  "status.saving": "Saving…",
  "status.loaded": "Loaded from keyboard.",
  "status.applied": "Applied and saved to the keyboard (live).",
  "status.error": "Error: ",
  "status.notConnected": "Connect a keyboard over Bluetooth first.",

  // Initial-sync status line — see the ja block's comment above.
  "sync.step.keymap": "Loading the keymap…",
  "sync.step.caps": "Checking the feature list…",
  "sync.step.macroNames": "Loading macro names…",

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
  "preconnect.timing":
    "This screen edits Hold-Tap (mt / lt) timing and the keyboard's debounce time.",
  "preconnect.backup":
    "This screen saves your keyboard settings to a file and restores them from one.",
  "preconnect.fwinfo":
    "This screen shows the connected keyboard's ext_FW version (the torabo firmware extensions) and the list of features it was built with.",

  "timing.debounce.bothHalves":
    "Applies to both halves — the central sends the setting to the other half on every connect.",
  "timing.debounce.centralOnly":
    "On this firmware it only applies to the central half — the right-hand side on this keyboard. It does not reach the left half (the split peripheral).",

  "coast.title": "Inertial scroll",
  "coast.desc":
    "Scrolling keeps gliding for a moment after you stop, in proportion to how fast you flicked — the way a phone or a real trackpad feels. It only applies to axes set to Scroll.",
  "coast.enable": "Enable inertial scroll",
  "coast.friction": "Glide length",
  "coast.frictionHint":
    "Smaller glides longer. 1 = several seconds / 8 = default (about 0.8 s) / 32 = stops almost at once.",
  "coast.threshold": "Start threshold",
  "coast.thresholdHint":
    "Slower moves than this never glide (unit: wheel ticks per second). Default 24. Raise it to glide only on a deliberate flick.",
  "coast.thresholdUnit": "ticks/s",
  "coast.note":
    "A glide stops the instant you touch again. It keeps running even after you leave the layer that started it.",
  "coast.perDevice":
    "This is a per-device setting — it is saved for the device selected above.",
  "coast.unavailable":
    "This firmware does not support inertial scroll. Update the firmware to use it.",

  // Bottom banner on the trackpad settings screen. Used to say each device is
  // saved separately; the implementation actually bundles every device's
  // config into one blob and writes it all at once, so the copy now matches.
  "trackpad.writeScope":
    "Switch devices with the dropdown above. A write saves every device together.",

  "uiscale.label": "Text size",
  "behavior.unavailable":
    "The list of behaviors has not arrived from the keyboard. Disconnect and connect again.",

  "empty.read": 'Press the blue "① Read" button to load the current settings.',
  "empty.macros": 'Press the blue "Read" button to load your saved macros.',
  "empty.combos": 'Press the blue "Read" button to load your saved combos.',
};

export const messages: Record<Lang, Dict> = {
  // platformMessages last: see its header comment for why a derivative
  // target's override is allowed to win over this app's own strings.
  ja: { ...panelJa, ...ja, ...platformMessages.ja },
  en: { ...panelEn, ...en, ...platformMessages.en },
};
