# Torabo-Studio

**[torabo-tsuki](https://github.com/sekigon-gonnoc/zmk-keyboard-torabo-tsuki-lp) 向けに機能拡張した [ZMK Studio](https://github.com/zmkfirmware/zmk-studio) の非公式フォーク。**

> ⚠️ 本プロジェクトは ZMK Project とは **提携・承認関係にありません**。ZMK Studio
> （Apache-2.0）を改変した非公式版です。問題報告は本リポジトリへお願いします。

ZMK Studio のキーマップ編集機能はそのままに、torabo-tsuki のトラックボール・トラックパッド・
エンコーダ・LED・マクロ・コンボを **再フラッシュせず BLE 経由でライブ編集**するためのタブを
追加しています。

## ZMK Studio からの追加機能

| タブ | 内容 |
|---|---|
| **キーマップ** | ZMK Studio 標準のキーマップ／レイヤー編集（上流機能そのまま） |
| **トラックボール** | レイヤー/軸ごとの move・scroll・速度、temp-layer（オートマウスレイヤー）を BLE でライブ設定 |
| **トラックパッド** | レイヤー/軸ごとに カーソル移動・スクロール・エンコーダ風スワイプ・タップ/2本指タップ/ホールド等のジェスチャを BLE でライブ設定 |
| **エンコーダ** | ロータリーエンコーダの回転（CW/CCW）にレイヤーごとの behavior を割当。音量等のプリセット＋任意キー割当 |
| **LED** | 左右それぞれの LED を「条件（レイヤー/モディファイア/用途）→ 色・点灯パターン」のルールで設定 |
| **マクロ** | `&dmac` ダイナミックマクロを BLE でライブ編集（NVS 保存、再フラッシュ不要）。`keymap.keymap` からの取り込みにも対応 |
| **コンボ** | キー位置の同時押しで behavior（kp/mo/to/tog/&dmac）を発火するコンボを BLE でライブ編集（NVS 保存、再フラッシュ不要） |
| **バックアップ** | 各種設定・マクロ・コンボ・キーマップを1ファイル（.json）にエクスポート/インポート。`keymap.keymap` 形式での書き出しも可 |
| **日本語 UI** | ヘッダーの言語トグルで 日本語 / English を切替（i18n） |

各タブの詳しい使い方は [docs/](docs/) を参照してください。

### 接続したキーボードに合わせてタブを出し分け

torabo-tsuki のファームウェアはスニペットの組み合わせでビルドされるため、キーボードごとに
搭載機能が異なります。本アプリは接続時にファームウェアへ**機能記述子**を問い合わせ、
**そのキーボードが実際に持つ機能のタブだけ**を表示します（例：エンコーダ非搭載ならエンコーダ
タブは出ない、LED がどちらの半分にも無ければ LED タブは出ない）。この記述子を持たない古い
ファームウェアでは、従来どおり全タブを表示します。

また、ファームウェアが本アプリの知らない新しいワイヤ形式を報告した場合は、書き込みで設定を
壊さないよう**そのタブを読み取り専用に切り替え**、アプリ更新を促します。

これらのタブは、対になるファームウェアモジュール
**[torabo-tsuki_ext_FW](https://github.com/tak-2025/torabo-tsuki_ext_FW)** が公開する
カスタム GATT サービスと通信します。ライブ編集を使うには、そのモジュールを含めてビルドした
ファームウェアが必要です。

## 動作環境

- **デスクトップアプリ**（推奨）: Tauri 製。Windows / macOS / Linux。BLE・シリアル両対応。
- **Web 版**: WebBluetooth/WebSerial 対応ブラウザ（Chrome / Edge など）。

> デスクトップ配布ビルドはコード署名していないため、初回起動時に OS の警告
> （Windows SmartScreen / macOS Gatekeeper）が出ることがあります。

## 開発・ビルド

```bash
npm install

# Web 開発サーバ
npm run dev

# デスクトップアプリ（開発）
npm run tauri dev

# デスクトップアプリ（配布ビルド）
npm run tauri build

# UI コンポーネントカタログ
npm run storybook
```

Rust ツールチェーン（Tauri 用）と Node.js が必要です。デスクトップの BLE 接続は
ネイティブ実装のため、Web 版で接続できない環境（Windows の WebBluetooth 等）でも
動作します。

## ライセンス / 帰属

本プロジェクトは **Apache License 2.0** で配布されます（上流 ZMK Studio を継承）。

- ライセンス全文: [LICENSE](LICENSE)
- 帰属表記: [NOTICE](NOTICE) — 上流 ZMK Studio の著作権表記を保持し、本フォークでの
  変更点を追記しています。
- 上流: [zmkfirmware/zmk-studio](https://github.com/zmkfirmware/zmk-studio)（Copyright
  The ZMK Contributors, Apache-2.0）

Apache-2.0 第4条に従い、原著作物の著作権・ライセンス・NOTICE 表記を保持し、本フォーク
で改変を加えた旨を明示しています。再配布の際は LICENSE と NOTICE を必ず同梱してください。
</content>
