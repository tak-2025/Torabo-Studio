// Localized strings for the led area. See src/i18n/panels/index.ts.
type Dict = Record<string, string>;

export const ja: Dict = {
  // Intro (the emphasis is a <b> in the JSX, hence the pre/strong/post split)
  "led.intro.pre": "拡張基盤の3色LEDを、",
  "led.intro.strong": "左右それぞれ独立に",
  "led.intro.post": "設定します。",
  "led.power.pre": "明るさは変えられません（PWMなし）。",
  "led.power.strong": "電池を左右するのは「光り方」",
  "led.power.post": "で、ゆっくり点滅は点灯の約1/40しか食いません。",

  "led.noHardware":
    "このキーボードにはLEDが載っていません（拡張LED基盤＋拡張パッドが必要です）。",

  // Per-side panels
  "led.side.left": "左",
  "led.side.right": "右",
  "led.addRule": "ルールを追加",
  "led.noRules":
    "ルールなし＝消灯（省電力）。「ルールを追加」で光らせる条件を決めます。",
  "led.priority.pre": "上から順に判定し、",
  "led.priority.strong": "最初に当てはまったルールが表示されます",
  "led.priority.post": "。警告を上、常時表示を下に。",

  // Rule row fields
  "led.field.trigger": "きっかけ",
  "led.field.colour": "色",
  "led.field.pattern": "光り方",
  "led.field.threshold": "しきい値 (%)",
  "led.field.mod": "どの修飾キー",
  "led.colour.auto": "自動（番号ごとに変わる）",

  // Use case groups
  "led.group.warning": "警告",
  "led.group.change": "変化の通知",
  "led.group.state": "状態表示",

  // Colours
  "led.colour.red": "赤",
  "led.colour.yellowGreen": "黄緑",
  "led.colour.green": "緑",
  "led.colour.redGreen": "赤+緑",
  "led.colour.redYellowGreen": "赤+黄緑",
  "led.colour.greenYellowGreen": "緑+黄緑",
  "led.colour.all": "全点灯",

  // Blink patterns
  "led.pattern.solid": "点灯",
  "led.pattern.solidNote": "条件が続く間ずっと。最も電池を食う",
  "led.pattern.blinkSlow": "ゆっくり点滅",
  "led.pattern.blinkSlowNote": "2秒に1回。点灯の約1/40",
  "led.pattern.blinkFast": "速い点滅",
  "led.pattern.blinkFastNote": "0.5秒に1回",
  "led.pattern.double": "ダブル点滅",
  "led.pattern.doubleNote": "2回光って長い休み。警告向き",
  "led.pattern.flash": "1秒光る",
  "led.pattern.flashNote": "変化したときに1回だけ",
  "led.pattern.flashLong": "1.5秒光る",
  "led.pattern.flashLongNote": "変化したときに1回だけ",

  // Use cases
  "led.uc.linkLost": "相方を見失った",
  "led.uc.linkLostNote":
    "左右のリンクが切れたとき。どちらの半分が落ちたか、その半分自身で分かる",
  "led.uc.batteryLow": "電池残量が少ない",
  "led.uc.batteryLowNote":
    "しきい値(%)を下回ったとき。左右それぞれ自分の電池を見る",
  "led.uc.profileChanged": "BLEプロファイル切替",
  "led.uc.profileChangedNote": "プロファイル番号ごとに色が変わる",
  "led.uc.layerChanged": "レイヤー変更",
  "led.uc.layerChangedNote": "レイヤー番号ごとに色が変わる",
  "led.uc.endpointChanged": "出力先切替 (USB↔BLE)",
  "led.uc.capsLock": "Caps Lock",
  "led.uc.capsLockNote": "ONの間ずっと。点滅にすると電池が持つ",
  "led.uc.modifier": "修飾キー押下中",
  "led.uc.modifierNote": "押している間だけ。一過性なので電池には優しい",

  // Accessible names
  "led.aria.usecase": "きっかけ",
  "led.aria.colour": "色",
  "led.aria.pattern": "光り方",
  "led.aria.moveUp": "上へ移動",
  "led.aria.moveDown": "下へ移動",
  "led.aria.remove": "削除",

  // Read / write status

  // Wire decode errors
  "led.err.short": "LED設定が短すぎます（{n} B）",
  "led.err.magic": "LED設定: マジックが不正です 0x{magic}",
  "led.err.version": "LED設定: 非対応のバージョン {version}",
  "led.err.truncated": "LED設定が途中で切れています: {got} B、{need} B必要です",
};

export const en: Dict = {
  "led.intro.pre": "Set up the extender board's three-colour LED ",
  "led.intro.strong": "independently for each half",
  "led.intro.post": ".",
  "led.power.pre": "Brightness is fixed — there is no PWM. ",
  "led.power.strong": "The pattern is what drives battery use",
  "led.power.post": ": a slow blink costs about 1/40 of a solid colour.",

  "led.noHardware":
    "This keyboard has no LED — it needs the LED extender board and an extender pad.",

  "led.side.left": "Left",
  "led.side.right": "Right",
  "led.addRule": "Add rule",
  "led.noRules":
    "No rules means the LED stays dark, which saves battery. Use “Add rule” to pick what lights it up.",
  "led.priority.pre": "Rules are checked from the top and ",
  "led.priority.strong": "the first one that matches is what you see",
  "led.priority.post": ". Put warnings above steady states.",

  "led.field.trigger": "Trigger",
  "led.field.colour": "Colour",
  "led.field.pattern": "Pattern",
  "led.field.threshold": "Threshold (%)",
  "led.field.mod": "Which modifiers",
  "led.colour.auto": "Automatic (varies by number)",

  "led.group.warning": "Warnings",
  "led.group.change": "Change notices",
  "led.group.state": "Status",

  "led.colour.red": "Red",
  "led.colour.yellowGreen": "Yellow-green",
  "led.colour.green": "Green",
  "led.colour.redGreen": "Red + green",
  "led.colour.redYellowGreen": "Red + yellow-green",
  "led.colour.greenYellowGreen": "Green + yellow-green",
  "led.colour.all": "All on",

  "led.pattern.solid": "Solid",
  "led.pattern.solidNote": "On for as long as the condition holds. Heaviest on battery.",
  "led.pattern.blinkSlow": "Slow blink",
  "led.pattern.blinkSlowNote": "Once every 2 s. About 1/40 of solid.",
  "led.pattern.blinkFast": "Fast blink",
  "led.pattern.blinkFastNote": "Once every 0.5 s.",
  "led.pattern.double": "Double blink",
  "led.pattern.doubleNote": "Two flashes, then a long pause. Good for warnings.",
  "led.pattern.flash": "1 s flash",
  "led.pattern.flashNote": "Once, the moment it changes.",
  "led.pattern.flashLong": "1.5 s flash",
  "led.pattern.flashLongNote": "Once, the moment it changes.",

  "led.uc.linkLost": "Lost the other half",
  "led.uc.linkLostNote":
    "When the link between the halves drops. Each half reports it on its own LED, so you can tell which one went down.",
  "led.uc.batteryLow": "Battery low",
  "led.uc.batteryLowNote":
    "When charge falls below the threshold (%). Each half watches its own battery.",
  "led.uc.profileChanged": "BLE profile switched",
  "led.uc.profileChangedNote": "The colour follows the profile number.",
  "led.uc.layerChanged": "Layer changed",
  "led.uc.layerChangedNote": "The colour follows the layer number.",
  "led.uc.endpointChanged": "Output switched (USB↔BLE)",
  "led.uc.capsLock": "Caps Lock",
  "led.uc.capsLockNote": "On the whole time Caps Lock is. A blink pattern saves battery.",
  "led.uc.modifier": "Modifier held",
  "led.uc.modifierNote": "Only while the key is held — brief, so it costs little battery.",

  "led.aria.usecase": "use case",
  "led.aria.colour": "colour",
  "led.aria.pattern": "pattern",
  "led.aria.moveUp": "Move up",
  "led.aria.moveDown": "Move down",
  "led.aria.remove": "Remove",


  "led.err.short": "LED config too short ({n} B)",
  "led.err.magic": "LED config: bad magic 0x{magic}",
  "led.err.version": "LED config: unsupported version {version}",
  "led.err.truncated": "LED config truncated: {got} B, need {need}",
};
