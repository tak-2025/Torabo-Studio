# vendor/zmk-studio-ts-client

`@zmkfirmware/zmk-studio-ts-client` v0.0.18 の**中身をそのまま取り込んだ**ローカル fork。
上流の `lib/` (protoc-gen-ts_proto v1.180.0 が出力した JS + d.ts) を丸ごとコピーし、
**torabo トンネル subsystem の 3 メッセージ + oneof 3 エントリだけを手で足してある。**

ルートの `package.json` からは `"@zmkfirmware/zmk-studio-ts-client": "file:vendor/zmk-studio-ts-client"`
で参照する。パッケージ名は上流と同じままなので、アプリ側の import 文は 1 行も変わらない。

## なぜ再生成せず手で足したか

上流は `.proto` を submodule から引いて `protoc` + `protoc-gen-ts_proto` で生成する
(`npm run generate`)。それを回すには protoc 本体・プラグイン・fork した
zmk-studio-messages のチェックアウトが要る。今回足すのは

- メッセージ 6 つ (`TunnelRequest` / `TunnelResponse` / `TunnelNotification` と、
  それを包む `zmk.torabo.Request` / `Response` / `Notification`)
- enum 2 つ (`TunnelOp` / `TunnelStatus`)
- `zmk.studio.Request` / `RequestResponse` / `Notification` の oneof に 1 エントリずつ
  (フィールド番号 6)

だけで、以後 feature が増えても `feature_id` が増えるだけ (proto は不変) なので、
ツールチェーンを立てるより生成物のパターンに正確に合わせて手書きするほうが安い。

**二段構えなのは ZMK 側の都合**: `ZMK_RPC_SUBSYSTEM(prefix)` マクロが
`zmk_studio_Request.subsystem.<prefix>.request_type.<handler>` という形を要求するため、
`TunnelRequest` を studio の oneof に直接は置けず、subsystem ごとのラッパが 1 段挟まる。

## 上流からの差分

| ファイル | 差分 |
| --- | --- |
| `lib/torabo.js` / `lib/torabo.d.ts` | **新規**。生成物と同じ体裁で手書き |
| `lib/studio.js` | `Request` / `RequestResponse` / `Notification` に `torabo` (field 6) の encode/decode/fromJSON/toJSON/fromPartial を追加 |
| `lib/studio.d.ts` | 同 3 インターフェースに `torabo?:` を追加 (`create`/`fromPartial` の巨大なマップド型は上流のまま) |
| `package.json` | scripts / devDependencies を削除 (postinstall の再生成を走らせないため)、version に `-torabo.1` |

`lib/transport/*`, `framing.js`, `core.*`, `keymap.*`, `behaviors.*`, `meta.*` は**無改変**。

`studio.js` の import エイリアス (`Request4` / `Response8` / `Notification10`) は
ts-proto の採番規則に合わせた見込みの名前で、実際に再生成すると番号がずれる可能性がある。
動作には影響しない。

## ワイヤ仕様

正は FW 側リポジトリの実物:
`torabo-tsuki-config/.zmk-workspace/modules/msgs/zmk-studio-messages/proto/zmk/torabo.proto`
(ブランチ `torabo-tunnel`)。要約すると:

```proto
package zmk.torabo;

enum TunnelOp     { ZMK_TORABO_TUNNEL_OP_READ = 0; ... WRITE = 1; SUBSCRIBE = 2; UNSUBSCRIBE = 3; }
enum TunnelStatus { ZMK_TORABO_TUNNEL_STATUS_OK = 0; ... UNSUPPORTED_FEATURE = 1; INVALID = 2; ERROR = 3; }

message TunnelRequest      { uint32 feature_id = 1; TunnelOp op = 2;     bytes blob = 3; }
message TunnelResponse     { TunnelStatus status = 1;                    bytes blob = 2; }
message TunnelNotification { uint32 feature_id = 1;                      bytes blob = 2; }

// subsystem ラッパ (ZMK_RPC_SUBSYSTEM が要求する 1 段)
message Request      { oneof request_type      { TunnelRequest tunnel = 1; } }
message Response     { oneof response_type     { TunnelResponse tunnel = 1; } }
message Notification { oneof notification_type { TunnelNotification tunnel = 1; } }
```

`zmk.studio.Request` / `RequestResponse` / `Notification` の oneof フィールド 6 が
上の `zmk.torabo.Request` / `Response` / `Notification` を運ぶ。

proto3 なので `status = OK (0)` はワイヤに出ない。**status 欠落 = OK** として扱うこと
(デコーダは既定値 0 を返すので自然にそうなる)。

`blob` の中身は既存の BLE GATT characteristic と 1 バイトも変わらない。
外側のフレーミング (SoF/ESC/EOF) は `tools/tunnel_test.py` (SDK ルート) が正。

## 上流を更新するとき

1. `npm pack @zmkfirmware/zmk-studio-ts-client@<新版>` で tarball を取り、`lib/` を置き換える
2. `lib/torabo.js` / `lib/torabo.d.ts` を戻す
3. `lib/studio.js` / `lib/studio.d.ts` に上表の差分を当て直す (`grep -n torabo` で確認)
4. `npm run test:ts-client` と `npm run build` を通す
