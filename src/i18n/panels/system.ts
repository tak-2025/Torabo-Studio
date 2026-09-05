// Localized strings for the system area. See src/i18n/panels/index.ts.
//
// "System" here means everything below the panels: the Web Bluetooth transport,
// the config characteristics, the RPC tunnel and its timeouts, the capability
// descriptor, and the download page. Most of these are thrown from module-level
// code with no component around them, so they are reached through `tr()` rather
// than `useT()`.
type Dict = Record<string, string>;

export const ja: Dict = {
  // --- Web Bluetooth transport (src/backends/webble/transport.ts) ---
  "sys.webble.unsupported":
    "このブラウザは Web Bluetooth に対応していません（Chrome か Edge をご利用ください）。",
  "sys.webble.connectTimeout": "接続がタイムアウトしました（{ms}ms）",
  "sys.webble.attachTimeout":
    "接続処理がタイムアウトしました（{ms}ms）。" +
    "ブラウザの制約により、この状態からは再接続できません。" +
    "ページを再読み込みしてから接続し直してください。",
  "sys.webble.rememberedUnreachable":
    "前回のキーボードに届きませんでした。" +
    "もう一度「Bluetooth」を押すと、選択画面が開きます。",
  "sys.webble.chooserFailed":
    "選択画面を開けませんでした。もう一度「Bluetooth」を押してください。",
  "sys.webble.noGatt": "GATT を利用できないデバイスです。",
  "sys.webble.noStudioService":
    "ZMK Studio サービスが見つかりません" +
    "（Studio 対応ファームウェアが書き込まれているか、" +
    "他のアプリが接続中でないかご確認ください）: {error}",
  "sys.webble.halfOpen":
    "キーボードとの接続が中途半端な状態です。" +
    "いったんページを再読み込みして接続し直してください" +
    "（それでも直らない場合は、キーボードのペアリングを削除して再ペアリングしてください）: {error}",
  "sys.webble.rpcCharNotWritable":
    "ZMK Studio の RPC characteristic が書き込みに対応していません" +
    "（ファームウェアが想定と異なります）。",
  "sys.webble.writeFailed":
    "RPC の送信に失敗しました（チャンク {n}/{total}, {bytes} バイト）: {error}",

  // --- Config characteristics over GATT (src/backends/webble/config.ts) ---
  "sys.cfg.disconnected": "キーボードとの接続が切れています。",
  "sys.cfg.serviceMissing":
    "{label} サービスがこのキーボードにありません" +
    "（その機能を含まないファームウェアの可能性があります）: {error}",
  "sys.cfg.readShort":
    "{label} の読み取りが {got} バイトでした（{need} バイト必要）。{cause}" +
    "\n（不完全なデータで保存するとキーボード側の設定が失われるため、中断しました）",
  "sys.cfg.readShort.att":
    "ブラウザが ATT の上限 512 バイトで読み取りを打ち切った可能性があります。",
  "sys.cfg.readShort.mismatch":
    "ファームウェアとアプリのバージョンが合っていない可能性があります。",
  // The USB advice is about OLD firmware only. {label} の分割書き込み受信
  // （チャンク再組み立て）に対応した FW ならこのメッセージには到達しない
  // ので、「BLE では保存できない」を言い切らないこと。
  "sys.cfg.tooLarge":
    "{label} が {bytes} バイトあり、1 回の書き込み上限 {max} バイトを超えています。" +
    "分割書き込み（チャンク受信）に対応したファームウェアなら分割して保存できますが、" +
    "それ以前のファームウェアの {label} は BLE 経由では保存できません。" +
    "その場合はキーボードのファームウェアを更新するか、USB 接続で保存してください" +
    "（レイヤー数を増やすと wire が長くなる点にご注意ください）。",
  "sys.cfg.writeFailed":
    "{label} の書き込みに失敗しました" +
    "（チャンク {n}/{total}, {bytes} バイト）: {error}",

  // --- RPC tunnel (src/backends/rpc/config.ts) ---
  "sys.tunnel.feature.caps": "機能一覧",
  "sys.tunnel.feature.trackball": "トラックボール",
  "sys.tunnel.feature.macros": "マクロ",
  "sys.tunnel.feature.combos": "コンボ",
  "sys.tunnel.feature.trackpad": "トラックパッド",
  "sys.tunnel.feature.encoder": "エンコーダー",
  "sys.tunnel.feature.led": "LED",
  "sys.tunnel.feature.liveFeed": "ライブ表示",
  "sys.tunnel.feature.timing": "タップ反応",
  "sys.tunnel.feature.unknown": "feature 0x{id}",
  "sys.tunnel.status.unsupported": "この機能を含まないファームウェアです",
  "sys.tunnel.status.invalid":
    "送ったデータをファームウェアが受け付けませんでした（アプリとファームウェアのバージョンが合っていない可能性があります）",
  "sys.tunnel.status.error": "ファームウェア側の処理に失敗しました",
  "sys.tunnel.status.unknown": "不明なステータス {status}",
  "sys.tunnel.noResponse":
    "{feature} の要求に対して、キーボードがトンネル応答を返しませんでした。",

  // --- Backend resolution (src/backends/index.ts) ---
  "sys.backend.noToraboAccess":
    "この接続では torabo 独自機能を利用できません。" +
    "USB でも使うにはキーボードのファームウェアがトンネル対応である必要があります" +
    "（旧ファームウェアではキーマップ編集のみ。独自設定は Bluetooth 接続でご利用ください）。",

  // --- RPC timeouts (src/rpc/logging.ts) ---
  "sys.rpc.idleTimeout":
    "{label}: 応答が {ms}ms 途絶えました" +
    "（この呼び出し中の受信: {chunks} チャンク / {bytes} バイト{detail}）",
  "sys.rpc.idleTimeout.last": "、最後の受信は {ago}ms 前",
  "sys.rpc.idleTimeout.none": "、まったく届いていません",
  "sys.rpc.maxTimeout": "{label}: {ms}ms を超えても完了しませんでした",

  // --- Capability descriptor (src/caps/toraboCaps.ts) ---
  "sys.caps.fwUnknown": "不明（この機能を持たない古いファームウェア）",

  // --- Download page (src/DownloadPage.tsx) ---
  "sys.download.buildHint": "デスクトップ版はソースからビルドしてください",
  "sys.download.noBinaries":
    "デスクトップ版のビルド済みバイナリは配布していません。" +
    "必要な方はリポジトリを fork して、ご自身でビルドしてください" +
    "（手順は README の「開発・ビルド」）。",
  "sys.download.useBrowser":
    "ビルドせずに使うなら、ブラウザ版（Chrome / Edge）をご利用ください。" +
    "キーマップ編集は USB でも Bluetooth でも行えます。" +
    "トラックボール等の設定は、ファームウェアがトンネル対応なら USB でも使えます" +
    "（旧ファームウェアでは Bluetooth 接続が必要です）。",
  "sys.download.for": "{name} 版をダウンロード",
  "sys.download.showAll": "すべてのダウンロードを表示",
  "sys.download.hideAll": "すべてのダウンロードを隠す",
  "sys.download.repo": "GitHub リポジトリ →",

  // --- Loose UI strings ---
  "sys.transport.bluetoothAll": "Bluetooth（すべての機器）",
  "sys.hid.hideKeyboard": "キーボードを隠す",
  "sys.hid.showKeyboard": "キーボードを表示",
};

export const en: Dict = {
  // --- Web Bluetooth transport (src/backends/webble/transport.ts) ---
  "sys.webble.unsupported":
    "This browser does not support Web Bluetooth. Please use Chrome or Edge.",
  "sys.webble.connectTimeout": "Connection timed out ({ms}ms)",
  "sys.webble.attachTimeout":
    "Connecting timed out ({ms}ms). The browser cannot reconnect from this " +
    "state, so please reload the page and connect again.",
  "sys.webble.rememberedUnreachable":
    "Could not reach the keyboard you used last time. Press “Bluetooth” again " +
    "to open the device chooser.",
  "sys.webble.chooserFailed":
    "Could not open the device chooser. Please press “Bluetooth” again.",
  "sys.webble.noGatt": "This device does not offer GATT.",
  "sys.webble.noStudioService":
    "No ZMK Studio service found. Check that the keyboard is running " +
    "Studio-capable firmware and that no other app is connected to it: {error}",
  "sys.webble.halfOpen":
    "The connection to the keyboard is only half set up. Reload the page and " +
    "connect again (if that does not help, remove the keyboard's pairing and " +
    "pair it again): {error}",
  "sys.webble.rpcCharNotWritable":
    "The ZMK Studio RPC characteristic is not writable — this firmware is not " +
    "what the app expects.",
  "sys.webble.writeFailed":
    "Failed to send the RPC (chunk {n}/{total}, {bytes} bytes): {error}",

  // --- Config characteristics over GATT (src/backends/webble/config.ts) ---
  "sys.cfg.disconnected": "The connection to the keyboard has been lost.",
  "sys.cfg.serviceMissing":
    "This keyboard has no {label} service — its firmware may not include that " +
    "feature: {error}",
  "sys.cfg.readShort":
    "Read {got} bytes of {label}, but {need} are needed. {cause}" +
    "\n(Saving incomplete data would wipe the keyboard's settings, so this was " +
    "stopped.)",
  "sys.cfg.readShort.att":
    "The browser may have cut the read short at the 512-byte ATT limit.",
  "sys.cfg.readShort.mismatch":
    "The firmware and the app may be different versions.",
  // The USB advice is about OLD firmware only: firmware that reassembles
  // chunked {label} writes never reaches this message, so do not state
  // "cannot be saved over BLE" as a blanket fact.
  "sys.cfg.tooLarge":
    "{label} is {bytes} bytes, over the {max}-byte limit for a single write. " +
    "Firmware that reassembles chunked writes takes it split; firmware older " +
    "than that cannot save this {label} over BLE at all. On that firmware, " +
    "update the keyboard's firmware or connect over USB to save it. Note that " +
    "adding layers makes the wire longer.",
  "sys.cfg.writeFailed":
    "Failed to write {label} (chunk {n}/{total}, {bytes} bytes): {error}",

  // --- RPC tunnel (src/backends/rpc/config.ts) ---
  "sys.tunnel.feature.caps": "Capabilities",
  "sys.tunnel.feature.trackball": "Trackball",
  "sys.tunnel.feature.macros": "Macros",
  "sys.tunnel.feature.combos": "Combos",
  "sys.tunnel.feature.trackpad": "Trackpad",
  "sys.tunnel.feature.encoder": "Encoder",
  "sys.tunnel.feature.led": "LED",
  "sys.tunnel.feature.liveFeed": "Live feed",
  "sys.tunnel.feature.timing": "Tap Response",
  "sys.tunnel.feature.unknown": "feature 0x{id}",
  "sys.tunnel.status.unsupported": "This firmware does not include that feature",
  "sys.tunnel.status.invalid":
    "The firmware rejected the data sent (the app and the firmware may be " +
    "different versions)",
  "sys.tunnel.status.error": "The firmware failed to handle the request",
  "sys.tunnel.status.unknown": "Unknown status {status}",
  "sys.tunnel.noResponse":
    "The keyboard did not answer the {feature} request over the tunnel.",

  // --- Backend resolution (src/backends/index.ts) ---
  "sys.backend.noToraboAccess":
    "The torabo settings are not available over this connection. To use them " +
    "over USB the keyboard needs firmware with tunnel support (older firmware " +
    "is keymap-only — connect over Bluetooth for the torabo settings).",

  // --- RPC timeouts (src/rpc/logging.ts) ---
  "sys.rpc.idleTimeout":
    "{label}: no response for {ms}ms " +
    "(received during this call: {chunks} chunks / {bytes} bytes{detail})",
  "sys.rpc.idleTimeout.last": ", last one {ago}ms ago",
  "sys.rpc.idleTimeout.none": ", nothing arrived at all",
  "sys.rpc.maxTimeout": "{label}: did not finish within {ms}ms",

  // --- Capability descriptor (src/caps/toraboCaps.ts) ---
  "sys.caps.fwUnknown": "Unknown (older firmware without this feature)",

  // --- Download page (src/DownloadPage.tsx) ---
  "sys.download.buildHint": "Build the desktop app from source",
  "sys.download.noBinaries":
    "Prebuilt desktop binaries are not distributed. If you want one, fork the " +
    "repository and build it yourself — see “Development and building” in the " +
    "README.",
  "sys.download.useBrowser":
    "To use it without building, open the browser version in Chrome or Edge. " +
    "Keymap editing works over both USB and Bluetooth. Trackball and the other " +
    "settings work over USB too, on firmware with tunnel support (older " +
    "firmware needs a Bluetooth connection).",
  "sys.download.for": "Download for {name}",
  "sys.download.showAll": "Show all downloads",
  "sys.download.hideAll": "Hide all downloads",
  "sys.download.repo": "GitHub repository →",

  // --- Loose UI strings ---
  "sys.transport.bluetoothAll": "Bluetooth (all devices)",
  "sys.hid.hideKeyboard": "Hide keyboard",
  "sys.hid.showKeyboard": "Show keyboard",
};
