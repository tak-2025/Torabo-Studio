// Localized strings for the firmware-info area. See src/i18n/panels/index.ts.
//
// This tab shows the capability descriptor the firmware sends on connect
// (src/caps/toraboCaps.ts, mirroring
// torabo-tsuki_ext_FW/caps/include/zmk_torabo_caps/caps.h).
//
// Most feature names are NOT here: a feature with a tab is named by that tab's
// own key (tab.trackball, tab.timing, …), so the two can never drift apart.
// See FEATURE_NAME_KEYS in src/caps/fwInfo.ts. Only the three features that
// have no tab — they describe the build rather than opening a screen — are
// named below.
type Dict = Record<string, string>;

export const ja: Dict = {
  "fw.title": "ファームウェア情報",
  "fw.subtitle":
    "接続中のキーボードが名乗った内容です。どの機能が入っているか、それぞれのデータ形式がアプリと合っているかを確認できます。表示のみで、書き込みはありません。",

  // Header block。バージョンは caps 記述子が名乗った値、つまり torabo の
  // 拡張ファームウェア（ext_FW）のバージョンです。ZMK 本体の版ではないので、
  // ラベルでも ext_FW と明示します。
  "fw.hdr.version": "ext_FW バージョン",
  "fw.hdr.descVersion": "記述子のバージョン",
  "fw.hdr.featureCount": "機能の数",

  // caps === null（記述子を読めなかった）
  "fw.none.title": "このキーボードは機能一覧を返しませんでした。",
  "fw.none.desc":
    "この機能を持たない古いファームウェアか、まだ読み取れていない可能性があります。" +
    "「読み込む」でもう一度試せます。読めない場合でも、各タブは従来どおりすべて表示され、" +
    "実際の読み書きはタブごとに成否が分かります。",

  // Feature table
  "fw.col.feature": "機能",
  "fw.col.wire": "データ形式",
  "fw.col.caps": "対応内容",
  "fw.wire.pair": "v{fw} / アプリ v{app}",
  "fw.wire.noApp": "v{fw} / アプリ —",
  "fw.wire.fwNewer":
    "ファームウェアの方が新しいため、この機能は読み取り専用です（アプリを更新してください）。",
  "fw.caps.unknownHint":
    "このアプリが名前を知らないビットです（ファームウェアの方が新しい可能性があります）。",
  // ファームウェアの方が古い側の案内。不具合ではないので警告文にはしません
  // ——アプリは古い形式もそのまま扱えます。新しい FW にすると増えるもの、という話。
  "fw.wire.gain": "v{since} から: {what}",
  "fw.gain.macros.names": "マクロ名の保存（キーキャップにも表示されます）",
  "fw.gain.trackball.coast": "慣性スクロール（コースト）",
  "fw.gain.trackpad.coast": "慣性スクロール（コースト）",

  // タブを持たない機能の名前だけ（他はタブ名 tab.* をそのまま使います）
  "fw.feat.reservedLayers": "予約レイヤー",
  "fw.feat.liveFeed": "ライブ表示",
  "fw.feat.rpcTunnel": "RPCトンネル",
  "fw.feat.unknown": "{id}（不明な機能）",

  // caps ビット（意味は機能ごとに異なります。caps.h の TORABO_CAPS_* が正）
  "fw.bit.coast": "慣性スクロール",
  "fw.bit.ledLeft": "左にLEDあり",
  "fw.bit.ledRight": "右にLEDあり",
  "fw.bit.ledCentralIsLeft": "中央（central）は左",
  "fw.bit.liveFeedDiag": "診断チャネルあり",
  "fw.bit.tunnelNotify": "通知（NOTIFY）対応",
  "fw.bit.splitDebounce": "デバウンスを左右へ配信",
  "fw.val.tpDevices": "パッド {value} 台分",
  "fw.val.layers": "{value} レイヤー",

  // モジュール構成。左右の見出しと「標準FFC」「トラックパッド」等は
  // trackpad パネルのキー（tp.side.* / tp.conn.standard / tp.kind.*）を
  // そのまま使い回しています。ここで定義するのは、この画面にしかない語だけ。
  "fw.mod.title": "モジュール構成",
  "fw.mod.desc": "FW情報から推定しています。",
  // 推定で置いたものの見せ方。FW が meta バイトで申告した位置と、こちらで
  // 推論した位置を、同じ見た目で並べないための札。
  "fw.mod.inferredLabel": "{item}（推定）",
  "fw.mod.inferredHint":
    "ファームウェアはこの位置を申告していません。構成から推定した位置です。",
  // 表の見出しは短い2語だけ。正式名称は見出しの tooltip と説明文に置きます
  // （狭いマスに「拡張基盤（拡張FFC）」と入れると、表が読めなくなるため）。
  "fw.mod.col.std": "標準",
  "fw.mod.col.ext": "拡張",
  // tooltip 用の正式名称。標準側は trackpad パネルの tp.conn.standard を流用。
  // 拡張側は、このマスに LED 基盤も入る＝FFC ではなく基盤全体を指すため別文。
  "fw.mod.col.extHint": "拡張基盤（拡張FFC）",
  // 左右の見出しに付く split の役割。Central / Peripheral は日本語にしません
  // （ZMK の設定・ドキュメントと同じ語でないと突き合わせられないため）。
  "fw.mod.sideRole": "{side}（{role}）",
  "fw.mod.extBase": "拡張基盤あり",
  "fw.mod.led": "LED基盤",
  "fw.mod.unplacedTitle": "位置が報告されていないモジュール",
  "fw.mod.trackball":
    "トラックボール（標準FFC接続。左右どちらかは FW 未報告）",
  "fw.mod.encoder": "ロータリーエンコーダ搭載（位置は FW 未報告）",
  "fw.mod.tpReadFailed":
    "デバイスの配置を読み取れませんでした。LED から分かる範囲だけを表示しています。",
  "fw.mod.tpPending": "デバイスの配置を読み取っています…",
  "fw.mod.capsUnknown":
    "機能一覧を読めていないため、モジュール構成は組み立てられません。",
  "fw.mod.note":
    "空欄は「申告がなかった」という意味で、部品が付いていないとは限りません。",

  // Raw bytes
  "fw.raw.summary": "生データ（バグ報告用）",
  "fw.raw.desc":
    "キーボードから届いた {bytes} バイトをそのまま並べたものです。ヘッダ8バイト＋機能ごとに4バイト。",
  "fw.raw.header": "ヘッダ",
  "fw.raw.entry": "機能 {n}",
  "fw.raw.trailing": "後続バイト",

  "fw.readOnlyNote":
    "ここに出ている内容はファームウェアのビルド結果そのものです。変更するにはファームウェアを書き換えてください。",
};

export const en: Dict = {
  "fw.title": "Firmware information",
  "fw.subtitle":
    "What the connected keyboard says about itself: which features its firmware was built with, and whether their data formats match this app. Read-only — there is nothing here to write.",

  "fw.hdr.version": "ext_FW version",
  "fw.hdr.descVersion": "Descriptor version",
  "fw.hdr.featureCount": "Features",

  "fw.none.title": "This keyboard did not report a feature list.",
  "fw.none.desc":
    "Either its firmware predates this feature, or the descriptor has not been read yet — press “Read” to try again. Either way nothing is lost: every tab stays available, and each one reports for itself whether the keyboard answered.",

  "fw.col.feature": "Feature",
  "fw.col.wire": "Data format",
  "fw.col.caps": "Capabilities",
  "fw.wire.pair": "v{fw} / app v{app}",
  "fw.wire.noApp": "v{fw} / app —",
  "fw.wire.fwNewer":
    "The firmware is newer than this app, so this feature is read-only. Please update the app.",
  "fw.caps.unknownHint":
    "A bit this app has no name for — the firmware may be newer than the app.",
  "fw.wire.gain": "From v{since}: {what}",
  "fw.gain.macros.names": "Saved macro names (they also show on the keycaps)",
  "fw.gain.trackball.coast": "Inertial scroll (coasting)",
  "fw.gain.trackpad.coast": "Inertial scroll (coasting)",

  "fw.feat.reservedLayers": "Reserved layers",
  "fw.feat.liveFeed": "Live feed",
  "fw.feat.rpcTunnel": "RPC tunnel",
  "fw.feat.unknown": "{id} (unknown feature)",

  "fw.bit.coast": "Inertial scroll",
  "fw.bit.ledLeft": "LED on the left",
  "fw.bit.ledRight": "LED on the right",
  "fw.bit.ledCentralIsLeft": "Left half is the central",
  "fw.bit.liveFeedDiag": "Diagnostic channel",
  "fw.bit.tunnelNotify": "Notifications (NOTIFY)",
  "fw.bit.splitDebounce": "Debounce sent to both halves",
  "fw.val.tpDevices": "{value} pad(s) on the wire",
  "fw.val.layers": "{value} layer(s)",

  "fw.mod.title": "Module layout",
  "fw.mod.desc": "Estimated from what the firmware reports.",
  "fw.mod.inferredLabel": "{item} (estimated)",
  "fw.mod.inferredHint":
    "The firmware does not report this position — it is deduced from the rest of the configuration.",
  "fw.mod.col.std": "Standard",
  "fw.mod.col.ext": "Extension",
  "fw.mod.col.extHint": "Extension base (ext FFC)",
  "fw.mod.sideRole": "{side} ({role})",
  "fw.mod.extBase": "Extension base fitted",
  "fw.mod.led": "LED board",
  "fw.mod.unplacedTitle": "Modules with no reported position",
  "fw.mod.trackball":
    "Trackball (on a standard FFC; the firmware does not report which half)",
  "fw.mod.encoder":
    "Rotary encoder present (the firmware does not report its position)",
  "fw.mod.tpReadFailed":
    "Could not read where the devices are. Showing only what the LED bits reveal.",
  "fw.mod.tpPending": "Reading where the devices are…",
  "fw.mod.capsUnknown":
    "No feature list was read, so the module layout cannot be assembled.",
  "fw.mod.note":
    "An empty cell means nothing was reported for it — not that nothing is fitted.",

  "fw.raw.summary": "Raw bytes (for bug reports)",
  "fw.raw.desc":
    "The {bytes} bytes exactly as the keyboard sent them: an 8-byte header, then 4 bytes per feature.",
  "fw.raw.header": "Header",
  "fw.raw.entry": "Feature {n}",
  "fw.raw.trailing": "Trailing bytes",

  "fw.readOnlyNote":
    "Everything here describes how the firmware was built. To change it, build and flash different firmware.",
};
