// Localized strings for the backup area. See src/i18n/panels/index.ts.
type Dict = Record<string, string>;

export const ja: Dict = {
  // --- Panel header ---
  "bk.title": "バックアップ（設定の保存・復元）",
  "bk.intro":
    "トラックボール設定・トラックパッド設定・エンコーダー設定・LED設定・タップ反応設定・マクロ・コンボ・キーマップを1つのファイル（.json）に保存／復元します。 ZMK での編集で設定が崩れても、ここから元に戻せます。",

  // --- Toolbar buttons ---
  "bk.btn.export": "エクスポート",
  "bk.btn.exportSub": "ファイルに保存",
  "bk.btn.exportKeymap": "keymap.keymap を保存",
  "bk.btn.exportKeymapSub": "ZMK ソース出力",
  "bk.btn.import": "インポート",
  "bk.btn.importSub": "ファイルから復元",
  "bk.btn.annotate": "ビヘイビア名を付与",
  "bk.btn.annotateSub": "旧ファイルを他機に移す準備",

  // --- Notes (❓ 注意事項) ---
  "bk.note.central":
    "設定は全て「右（central）」に保存されます。左は素 FW を焼けば復活するので、このファイルだけで完全バックアップです。",
  "bk.note.unlockPre": "キーマップの復元は ",
  "bk.note.unlockBold": "Studio のロック解除",
  "bk.note.unlockPost":
    "が必要です（キーボード側で解除）。トラックボール設定だけならロック不要。",
  "bk.note.partialPre": "復元はキー位置単位で書き戻します。",
  "bk.note.partialBold": "レイヤー数やキー数が違っても中断しません",
  "bk.note.partialPost":
    " — 今のキーボードにあるレイヤーだけを先頭から順に同期し、はみ出した分はスキップします（スキップ内容は結果に表示）。",
  "bk.note.independentPre":
    "トラックボール／トラックパッド／エンコーダー／LED／タップ反応／マクロ／コンボ／キーマップは",
  "bk.note.independentBold": "それぞれ独立して復元",
  "bk.note.independentPost":
    "します。古いファームのバックアップでどれかが読めなくても、残りはそのまま復元されます。",
  "bk.note.featureGatedPre": "エンコーダー・LED・タップ反応の設定は",
  "bk.note.featureGatedBold": "その機能を持つファームウェアでのみ",
  "bk.note.featureGatedPost":
    "保存・復元されます（v5以降）。無い機種向けのファイルを読み込んでも、その項目はスキップされるだけでエラーにはなりません。",
  "bk.note.idsPre": "ZMK はビヘイビアの番号（behaviorId）を",
  "bk.note.idsBold1": "キーボード個体ごとに採番",
  "bk.note.idsMid": "します（同じ ",
  "bk.note.idsMid2": " が別の個体では別番号）。そのためエクスポートには",
  "bk.note.idsBold2": "番号↔ビヘイビア名の対応表",
  "bk.note.idsPost":
    "を一緒に保存し、インポート時に今のキーボードの番号へ読み替えます。",
  "bk.note.oldBold1": "v3 以前の古いファイルには対応表がありません。",
  "bk.note.oldMid": "別のキーボードへ移したい場合は、",
  "bk.note.oldBold2": "そのファイルを取った側のキーボードに接続して",
  "bk.note.oldPost":
    "「ビヘイビア名を付与」を実行し、出力されたファイルを移したいキーボードでインポートしてください。同じ個体に戻すだけなら付与は不要です。",
  "bk.note.dtsPre": "「keymap.keymap を保存」は",
  "bk.note.dtsBold": "有効レイヤーのみ",
  "bk.note.dtsMid": "を ZMK ソースとして出力します（キーコードは",
  "bk.note.dtsMid2": " 等の名前、未知値は数値＋",
  "bk.note.dtsMid3":
    "）。マクロ・combos・予約レイヤーは含まれないので、既存の keymap.keymap にマージし",
  "bk.note.dtsBold2": "/* FIXME */",
  "bk.note.dtsPost": "を確認してから使ってください。",

  // --- Section names (UI labels and result-list entries alike) ---
  "bk.sec.trackball": "トラックボール設定",
  "bk.sec.trackpad": "トラックパッド設定",
  "bk.sec.encoder": "エンコーダー設定",
  "bk.sec.led": "LED設定",
  "bk.sec.timing": "タップ反応設定",
  "bk.sec.macros": "マクロ",
  "bk.sec.combos": "コンボ",
  "bk.sec.keymap": "キーマップ",

  // --- Progress ---
  "bk.busy.export": "エクスポート中…",
  "bk.busy.behaviorNames": "ビヘイビア名を取得中…",
  "bk.busy.behaviorTable": "ビヘイビア表を読み込み中…",
  "bk.busy.genKeymap": "keymap.keymap を生成中…",
  "bk.busy.import": "インポート中…",
  "bk.busy.restoreKeymap": "キーマップを復元中…",
  "bk.busy.restoreLayer": "キーマップを復元中… レイヤー {n}/{total}",
  "bk.busy.restoreMacros": "マクロを復元中…",
  "bk.busy.restoreCombos": "コンボを復元中…",

  // --- Export results ---
  "bk.export.keymap": "キーマップ {n} レイヤー{note}",
  "bk.export.withNames": "（ビヘイビア名付き）",
  "bk.export.noNames": "（名前表なし: 他機に復元不可）",
  "bk.ok.saved": "保存しました（{parts}）: {label}",
  "bk.ok.keymapSaved": "keymap.keymap を保存しました（{n} レイヤー）{warn}: {label}",
  "bk.keymapFixmes": "（要確認 FIXME {n}件）",

  // --- Errors ---
  "bk.err.nothingToExport": "取得できる設定がありませんでした。",
  "bk.err.noKeymap": "キーマップを取得できませんでした。",
  "bk.err.noCurrentKeymap": "現在のキーマップを取得できませんでした。",
  "bk.err.noKeymapInFile": "このファイルにはキーマップが入っていません。",
  "bk.err.noBehaviorList": "キーボードからビヘイビア一覧を取得できませんでした。",
  "bk.err.notInBackup": "バックアップに含まれていません",
  "bk.err.needUnlock":
    "Studio のロック解除が必要です。キーボードで解除してから再実行してください",
  "bk.err.nothingRestored": "復元できる項目がありませんでした。",
  "bk.err.notObject": "ファイルの中身が不正です（JSON オブジェクトではありません）。",
  "bk.err.notBackup":
    "このファイルは torabo バックアップではありません（format={format}）。",
  "bk.compat.newer":
    "このファイルは新しいバックアップ版です（version={version} > {max}）。読める範囲だけ復元します。",

  // --- Annotate (add the behavior-name table to an older file) ---
  "bk.annotate.missingIds": "このキーボードに無いID: {ids}",
  "bk.annotate.mismatchedIds":
    "パラメータを取らないはずのIDに値が入っている: {ids}",
  "bk.confirm.annotate":
    "このバックアップは、今つないでいるキーボードのものではない可能性があります。\n{why}\n\nそれでも今のキーボードの名前表で付与しますか？",
  "bk.ok.annotated": "ビヘイビア名を付与して保存しました（{n} 個のID）: {label}",
  "bk.annotate.unnamedIds": "名前を取れなかったID: {ids}",
  "bk.annotate.next":
    "このファイルを、復元したいキーボードで「インポート」してください。",

  // --- Import ---
  "bk.confirm.import":
    "現在のキーボード設定を、このバックアップで上書きします。よろしいですか？",
  "bk.sectionFailed": "{label}（{err}）",
  "bk.skip.noEncoder":
    "エンコーダー設定（このキーボードにはエンコーダー機能がありません）",
  "bk.skip.noLed": "LED設定（このキーボードにはLED機能がありません）",
  "bk.skip.noTiming": "タップ反応設定（このキーボードにはこの機能がありません）",
  "bk.skip.fwNewerThanApp":
    "{label}（キーボードのファームウェアがこのアプリより新しいため、" +
    "設定が壊れるのを防いでスキップしました。アプリを更新してください）",
  "bk.skip.blobNewerThanFw":
    "{label}（バックアップの形式 v{file} が、" +
    "このキーボードのファームウェア（v{fw}）より新しいためスキップしました）",
  // Sections restored by decoding and replaying (macros): the limit is what
  // this app can read, not what the keyboard speaks.
  "bk.skip.blobNewerThanApp":
    "{label}（バックアップの形式 v{file} が、" +
    "このアプリが読める版（v{app}）より新しいためスキップしました。" +
    "アプリを更新してください）",
  "bk.skip.macroNamesUnsupported":
    "マクロ名は復元先のファームウェアが対応していないため反映されませんでした" +
    "（マクロの内容は復元済みです）",
  "bk.skip.tpReadbackTooBig":
    "{label}（このバックアップの内容は書き込むと {size} バイトになり、" +
    "ファームウェアの読み出し上限 {max} バイトを超えます。" +
    "書き込むと以後この設定を読み出せなくなるためスキップしました）",
  "bk.restored.macros": "マクロ {n} スロット",
  // Only when the file's macro wire is v2, i.e. it carries slot names.
  "bk.restored.macrosNamed": "マクロ {n} スロット（名前も復元）",
  "bk.restored.combos": "コンボ {n} 枠",
  "bk.restored.keymap": "キーマップ {done}/{total} レイヤー（{bits}）",
  "bk.km.changed": "キー {n} 個更新",
  "bk.km.failed": "失敗 {n}",
  "bk.km.remapped": "ID読み替え {n} 個",
  "bk.km.unsupported": "このFWに無いビヘイビア {n} 個スキップ",
  "bk.ok.restored": "復元しました（{parts}）。",
  "bk.skipList": "スキップ: {items}",

  // --- Import notes / diagnostics ---
  "bk.skip.noNameTable":
    "このファイルにはビヘイビア名表がありません（v3以前）。別のキーボードのファイルなら「ビヘイビア名を付与」を元のキーボードで実行してから読み込んでください",
  "bk.skip.unmappedNames": "このキーボードに無いビヘイビア: {names}",
  "bk.skip.duplicateNames": "同名ビヘイビアが複数あり読み替えが曖昧: {names}",
  "bk.skip.selfTestNg":
    "自己診断NG: キーボード自身の現在のバインディングを書き戻しても拒否されました（応答 {code}）。バックアップの中身ではなくキーボード側の問題です",
  "bk.skip.selfTestOk":
    "自己診断OK: 同じ位置に現在値を書き戻すのは通ります（拒否されたのはファイル側の値）",
  "bk.skip.failBreakdown": "失敗内訳 {label}: {n} 件",
  "bk.skip.abortedEarly":
    "最初の {n} 件が全て拒否されたため中断しました（キーボードは無変更）",
  "bk.skip.noBehaviorList":
    "FW のビヘイビア一覧が読めませんでした（事前チェック無しで書き込み）",
  "bk.skip.layerCount":
    "レイヤー数が違います（ファイル {file} / キーボード {kbd}）。キーボードにあるレイヤーだけ同期しました",
  "bk.skip.keysUnwritten": "ファイル側の余分なキー位置 {n} 個",
  "bk.skip.keysUntouched": "ファイルに無いキー位置 {n} 個（現状のまま）",

  // --- setLayerBinding failure codes (RPC enum order) ---
  "bk.fail.1": "キー位置/レイヤーが無効",
  "bk.fail.2": "このFWに無いビヘイビアID",
  "bk.fail.3":
    "パラメータが無効（IDのズレでビヘイビアが別物になっている可能性）",
  "bk.fail.other": "RPCエラー/応答なし",
  "bk.fail.code": "コード {code}",
};

export const en: Dict = {
  // --- Panel header ---
  "bk.title": "Backup (save and restore settings)",
  "bk.intro":
    "Saves the trackball, trackpad, encoder, LED, tap response, macro, combo and keymap settings into a single file (.json), and restores them from one. If editing in ZMK leaves your settings in a mess, this is how you get them back.",

  // --- Toolbar buttons ---
  "bk.btn.export": "Export",
  "bk.btn.exportSub": "Save to a file",
  "bk.btn.exportKeymap": "Save keymap.keymap",
  "bk.btn.exportKeymapSub": "ZMK source output",
  "bk.btn.import": "Import",
  "bk.btn.importSub": "Restore from a file",
  "bk.btn.annotate": "Add behavior names",
  "bk.btn.annotateSub": "Prepare an old file for another keyboard",

  // --- Notes ---
  "bk.note.central":
    "Every setting is stored on the right (central) half. The left half comes back by flashing stock firmware, so this one file is a complete backup.",
  "bk.note.unlockPre": "Restoring the keymap needs ",
  "bk.note.unlockBold": "Studio unlocked",
  "bk.note.unlockPost":
    " (unlock it on the keyboard). Trackball settings alone need no unlock.",
  "bk.note.partialPre": "A restore writes back key position by key position. ",
  "bk.note.partialBold": "A different layer or key count never aborts it",
  "bk.note.partialPost":
    " — it syncs the layers this keyboard has, in order from the first, and skips whatever hangs off the end (the result lists what was skipped).",
  "bk.note.independentPre":
    "Trackball, trackpad, encoder, LED, tap response, macros, combos and the keymap are each ",
  "bk.note.independentBold": "restored independently",
  "bk.note.independentPost":
    ". If one of them cannot be read from an older firmware's backup, the rest still restores.",
  "bk.note.featureGatedPre":
    "Encoder, LED and tap response settings are saved and restored ",
  "bk.note.featureGatedBold": "only on firmware that has those features",
  "bk.note.featureGatedPost":
    " (v5 and later). Loading a file made for a model without them simply skips those sections — it is not an error.",
  "bk.note.idsPre": "ZMK numbers each behavior (behaviorId) ",
  "bk.note.idsBold1": "per keyboard unit",
  "bk.note.idsMid": " — the same ",
  "bk.note.idsMid2":
    " has a different number on another unit. An export therefore also stores an ",
  "bk.note.idsBold2": "id ↔ behavior-name table",
  "bk.note.idsPost":
    ", and an import translates those ids into this keyboard's numbering.",
  "bk.note.oldBold1": "Files from v3 and earlier have no such table.",
  "bk.note.oldMid": " To move one to a different keyboard, ",
  "bk.note.oldBold2": "connect the keyboard the file came from",
  "bk.note.oldPost":
    ", run \"Add behavior names\", and import the file it writes on the target keyboard. Restoring onto the same unit needs no names.",
  "bk.note.dtsPre": '"Save keymap.keymap" writes ',
  "bk.note.dtsBold": "only the active layers",
  "bk.note.dtsMid": " as ZMK source (keycodes as names like ",
  "bk.note.dtsMid2": ", unknown values as a number plus ",
  "bk.note.dtsMid3":
    "). Macros, combos and reserved layers are not included, so merge it into your existing keymap.keymap and check every ",
  "bk.note.dtsBold2": "/* FIXME */",
  "bk.note.dtsPost": " before using it.",

  // --- Section names ---
  "bk.sec.trackball": "Trackball settings",
  "bk.sec.trackpad": "Trackpad settings",
  "bk.sec.encoder": "Encoder settings",
  "bk.sec.led": "LED settings",
  "bk.sec.timing": "Tap response settings",
  "bk.sec.macros": "Macros",
  "bk.sec.combos": "Combos",
  "bk.sec.keymap": "Keymap",

  // --- Progress ---
  "bk.busy.export": "Exporting…",
  "bk.busy.behaviorNames": "Reading behavior names…",
  "bk.busy.behaviorTable": "Loading the behavior table…",
  "bk.busy.genKeymap": "Generating keymap.keymap…",
  "bk.busy.import": "Importing…",
  "bk.busy.restoreKeymap": "Restoring the keymap…",
  "bk.busy.restoreLayer": "Restoring the keymap… layer {n}/{total}",
  "bk.busy.restoreMacros": "Restoring macros…",
  "bk.busy.restoreCombos": "Restoring combos…",

  // --- Export results ---
  "bk.export.keymap": "Keymap, {n} layers {note}",
  "bk.export.withNames": "(with behavior names)",
  "bk.export.noNames": "(no name table: cannot restore onto another keyboard)",
  "bk.ok.saved": "Saved ({parts}): {label}",
  "bk.ok.keymapSaved": "Saved keymap.keymap, {n} layers{warn}: {label}",
  "bk.keymapFixmes": " (check {n} FIXME)",

  // --- Errors ---
  "bk.err.nothingToExport": "Nothing could be read from the keyboard.",
  "bk.err.noKeymap": "Could not read the keymap.",
  "bk.err.noCurrentKeymap": "Could not read the current keymap.",
  "bk.err.noKeymapInFile": "This file contains no keymap.",
  "bk.err.noBehaviorList": "Could not read the behavior list from the keyboard.",
  "bk.err.notInBackup": "not in this backup",
  "bk.err.needUnlock":
    "Studio must be unlocked — unlock it on the keyboard and run this again",
  "bk.err.nothingRestored": "There was nothing to restore.",
  "bk.err.notObject": "The file's contents are invalid (not a JSON object).",
  "bk.err.notBackup": "This is not a torabo backup file (format={format}).",
  "bk.compat.newer":
    "This file uses a newer backup version (version={version} > {max}). Only what can be read will be restored.",

  // --- Annotate ---
  "bk.annotate.missingIds": "IDs this keyboard does not have: {ids}",
  "bk.annotate.mismatchedIds":
    "IDs that should take no parameters carry values: {ids}",
  "bk.confirm.annotate":
    "This backup may not be from the keyboard you are connected to.\n{why}\n\nAdd names from this keyboard's table anyway?",
  "bk.ok.annotated": "Saved with behavior names added ({n} IDs): {label}",
  "bk.annotate.unnamedIds": "IDs with no name available: {ids}",
  "bk.annotate.next":
    "Import this file on the keyboard you want to restore onto.",

  // --- Import ---
  "bk.confirm.import":
    "This overwrites the keyboard's current settings with this backup. Continue?",
  "bk.sectionFailed": "{label} ({err})",
  "bk.skip.noEncoder": "Encoder settings (this keyboard has no encoder feature)",
  "bk.skip.noLed": "LED settings (this keyboard has no LED feature)",
  "bk.skip.noTiming":
    "Tap response settings (this keyboard does not have that feature)",
  "bk.skip.fwNewerThanApp":
    "{label} (this keyboard's firmware is newer than this app, so it was " +
    "skipped to avoid damaging its settings — please update the app)",
  "bk.skip.blobNewerThanFw":
    "{label} (the backup's wire format v{file} is newer than this keyboard's " +
    "firmware, which speaks v{fw})",
  "bk.skip.blobNewerThanApp":
    "{label} (the backup's wire format v{file} is newer than this app can " +
    "read, which is v{app} — please update the app)",
  "bk.skip.macroNamesUnsupported":
    "Macro names were not restored: this keyboard's firmware does not store " +
    "them (the macros themselves were restored)",
  "bk.skip.tpReadbackTooBig":
    "{label} (writing this backup would make the settings {size} bytes, over " +
    "the firmware's {max}-byte read-back limit — they could never be read back " +
    "again, so it was skipped)",
  "bk.restored.macros": "Macros, {n} slots",
  "bk.restored.macrosNamed": "Macros, {n} slots (names restored too)",
  "bk.restored.combos": "Combos, {n} slots",
  "bk.restored.keymap": "Keymap, {done}/{total} layers ({bits})",
  "bk.km.changed": "{n} keys updated",
  "bk.km.failed": "{n} failed",
  "bk.km.remapped": "{n} ids remapped",
  "bk.km.unsupported": "{n} skipped, behavior not in this firmware",
  "bk.ok.restored": "Restored ({parts}).",
  "bk.skipList": "Skipped: {items}",

  // --- Import notes / diagnostics ---
  "bk.skip.noNameTable":
    'This file has no behavior-name table (v3 or earlier). If it came from another keyboard, run "Add behavior names" on that keyboard first, then load the file it writes',
  "bk.skip.unmappedNames": "Behaviors this keyboard does not have: {names}",
  "bk.skip.duplicateNames":
    "Duplicate behavior names make the translation ambiguous: {names}",
  "bk.skip.selfTestNg":
    "Self-test failed: the keyboard rejected even writing its own current binding back (response {code}). The problem is the keyboard, not the backup's contents",
  "bk.skip.selfTestOk":
    "Self-test passed: writing the current value back to the same position works, so what was rejected is the file's values",
  "bk.skip.failBreakdown": "Failures — {label}: {n}",
  "bk.skip.abortedEarly":
    "Stopped after the first {n} writes were all rejected (the keyboard is unchanged)",
  "bk.skip.noBehaviorList":
    "Could not read the firmware's behavior list (written without the pre-check)",
  "bk.skip.layerCount":
    "Layer counts differ (file {file} / keyboard {kbd}). Only the layers the keyboard has were synced",
  "bk.skip.keysUnwritten": "{n} extra key positions in the file",
  "bk.skip.keysUntouched":
    "{n} key positions missing from the file (left as they are)",

  // --- setLayerBinding failure codes ---
  "bk.fail.1": "invalid key position or layer",
  "bk.fail.2": "behavior id not in this firmware",
  "bk.fail.3":
    "invalid parameters (an id mismatch may point the binding at a different behavior)",
  "bk.fail.other": "RPC error / no response",
  "bk.fail.code": "code {code}",
};
