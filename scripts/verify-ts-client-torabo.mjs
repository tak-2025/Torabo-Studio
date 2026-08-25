// Round-trip / wire-compat check for the vendored ts-client torabo additions
// (vendor/zmk-studio-ts-client — hand-edited generated code, so it needs a test
// that generated code would not).
//
//   npm run test:ts-client
//
// The shape under test is the two-level one the firmware actually builds, taken
// from the proto that ships with it:
//   torabo-tsuki-config/.zmk-workspace/modules/msgs/zmk-studio-messages/
//     proto/zmk/torabo.proto  (branch torabo-tunnel)
//
//   studio.Request.torabo (6) = torabo.Request { oneof { TunnelRequest tunnel = 1 } }
//
// ZMK's ZMK_RPC_SUBSYSTEM macro requires that per-subsystem wrapper; the tunnel
// message cannot sit directly in the studio oneof.
//
// Byte expectations are cross-checked by hand against the wire encoding rules
// (see also the SDK's tools/tunnel_test.py, whose flat framing is the outer
// layer and is unchanged).
//
// Run through esbuild rather than node directly: the generated code imports
// "protobufjs/minimal" without an extension, which Vite resolves and bare Node
// ESM does not.
import assert from "node:assert/strict";
import {
  Request,
  RequestResponse,
  Response,
  Notification,
} from "@zmkfirmware/zmk-studio-ts-client/studio";
import {
  TunnelOp,
  TunnelStatus,
  TunnelRequest,
  TunnelResponse,
  TunnelNotification,
  Request as ToraboRequest,
  Response as ToraboResponse,
  Notification as ToraboNotification,
} from "@zmkfirmware/zmk-studio-ts-client/torabo";

const hex = (u8) => Buffer.from(u8).toString("hex");

// --- 1. Request encode, outer studio.Request -> torabo.Request -> TunnelRequest
// requestId=1, feature 0x09 (trackball), op READ.
//   studio.Request : 08 01                       request_id = 1
//                    32 <len> [ torabo.Request ]  field 6, LEN
//   torabo.Request : 0a <len> [ TunnelRequest ]   field 1, LEN
//   TunnelRequest  : 08 09                        feature_id = 9
//                    (op READ = 0, omitted: proto3 default)
{
  const bytes = Request.encode({
    requestId: 1,
    torabo: {
      tunnel: {
        featureId: 0x09,
        op: TunnelOp.ZMK_TORABO_TUNNEL_OP_READ,
        blob: new Uint8Array(),
      },
    },
  }).finish();
  assert.equal(hex(bytes), "0801" + "3204" + "0a02" + "0809");
  console.log("OK  Request(READ 0x09) =", hex(bytes));
}

// WRITE with a blob: op -> 10 01, blob -> 1a <len> <bytes>
{
  const blob = Uint8Array.from([0x7a, 0x74, 0x02, 0x00]);
  const bytes = Request.encode({
    requestId: 7,
    torabo: {
      tunnel: {
        featureId: 0x0c,
        op: TunnelOp.ZMK_TORABO_TUNNEL_OP_WRITE,
        blob,
      },
    },
  }).finish();
  assert.equal(
    hex(bytes),
    "0807" + "320c" + "0a0a" + "080c" + "1001" + "1a04" + "7a740200",
  );
  console.log("OK  Request(WRITE 0x0c) =", hex(bytes));
}

// SUBSCRIBE, feature 0x0f (live_feed)
{
  const bytes = Request.encode({
    requestId: 2,
    torabo: {
      tunnel: {
        featureId: 0x0f,
        op: TunnelOp.ZMK_TORABO_TUNNEL_OP_SUBSCRIBE,
        blob: new Uint8Array(),
      },
    },
  }).finish();
  assert.equal(hex(bytes), "0802" + "3206" + "0a04" + "080f" + "1002");
  console.log("OK  Request(SUBSCRIBE 0x0f) =", hex(bytes));
}

// feature 0x00 (caps) + READ: every TunnelRequest field is a proto3 default, so
// the inner message is legitimately empty. The two oneof tags still select it,
// which is exactly what the connect-time probe relies on.
{
  const bytes = Request.encode({
    requestId: 1,
    torabo: {
      tunnel: {
        featureId: 0x00,
        op: TunnelOp.ZMK_TORABO_TUNNEL_OP_READ,
        blob: new Uint8Array(),
      },
    },
  }).finish();
  assert.equal(hex(bytes), "0801" + "3202" + "0a00");
  console.log("OK  Request(READ caps) =", hex(bytes));
}

// --- 2. Request decode round-trip, through both oneof levels
{
  const src = {
    requestId: 42,
    torabo: {
      tunnel: {
        featureId: 0x0a,
        op: TunnelOp.ZMK_TORABO_TUNNEL_OP_WRITE,
        blob: Uint8Array.from({ length: 300 }, (_, i) => i & 0xff),
      },
    },
  };
  const back = Request.decode(Request.encode(src).finish());
  assert.equal(back.requestId, 42);
  assert.equal(back.torabo.tunnel.featureId, 0x0a);
  assert.equal(back.torabo.tunnel.op, TunnelOp.ZMK_TORABO_TUNNEL_OP_WRITE);
  assert.equal(hex(back.torabo.tunnel.blob), hex(src.torabo.tunnel.blob));
  assert.equal(back.core, undefined);
  console.log("OK  Request round-trip, 300B blob");
}

// --- 3. RequestResponse decode: what the firmware sends back.
{
  const blob = Uint8Array.from([1, 2, 3, 4, 5]);
  const wire = Response.encode({
    requestResponse: {
      requestId: 5,
      torabo: { tunnel: { status: TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_OK, blob } },
    },
  }).finish();
  // 0a <len> [ 08 05  32 <len> [ 0a <len> [ 12 05 0102030405 ] ] ]
  assert.equal(
    hex(wire),
    "0a0d" + "0805" + "3209" + "0a07" + "1205" + "0102030405",
  );
  const back = Response.decode(wire);
  assert.equal(back.requestResponse.requestId, 5);
  // status OK is the proto3 default, so it never reaches the wire — the decoder
  // has to produce OK from its absence, which is the contract the backend reads.
  assert.equal(
    back.requestResponse.torabo.tunnel.status,
    TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_OK,
  );
  assert.equal(hex(back.requestResponse.torabo.tunnel.blob), "0102030405");
  console.log("OK  Response(request_response.torabo.tunnel) =", hex(wire));
}

// A blob-less OK response encodes to an entirely empty TunnelResponse.
{
  const wire = Response.encode({
    requestResponse: {
      requestId: 4,
      torabo: {
        tunnel: {
          status: TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_OK,
          blob: new Uint8Array(),
        },
      },
    },
  }).finish();
  assert.equal(hex(wire), "0a06" + "0804" + "3202" + "0a00");
  const t = Response.decode(wire).requestResponse.torabo.tunnel;
  assert.equal(t.status, TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_OK);
  assert.equal(t.blob.length, 0);
  console.log("OK  Response(WRITE ack, empty) =", hex(wire));
}

// Non-OK status: an enum, so int32 on field 1.
{
  const wire = Response.encode({
    requestResponse: {
      requestId: 3,
      torabo: {
        tunnel: {
          status: TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_UNSUPPORTED_FEATURE,
          blob: new Uint8Array(),
        },
      },
    },
  }).finish();
  assert.equal(hex(wire), "0a08" + "0803" + "3204" + "0a02" + "0801");
  const back = Response.decode(wire);
  assert.equal(
    back.requestResponse.torabo.tunnel.status,
    TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_UNSUPPORTED_FEATURE,
  );
  console.log("OK  Response status=UNSUPPORTED_FEATURE");
}

// A RequestResponse carrying meta (pre-tunnel firmware answering an unknown
// subsystem) must leave `torabo` undefined — that is the probe's negative.
{
  const wire = RequestResponse.encode({
    requestId: 1,
    meta: { simpleError: 2 },
  }).finish();
  const back = RequestResponse.decode(wire);
  assert.equal(back.torabo, undefined);
  assert.equal(back.meta.simpleError, 2);
  console.log("OK  RequestResponse(meta only).torabo === undefined");
}

// --- 4. Notification decode (live_feed 16B event)
{
  const blob = Uint8Array.from({ length: 16 }, (_, i) => 0xf0 + (i & 0x0f));
  const wire = Response.encode({
    notification: { torabo: { tunnel: { featureId: 0x0f, blob } } },
  }).finish();
  const back = Response.decode(wire);
  assert.equal(back.notification.torabo.tunnel.featureId, 0x0f);
  assert.equal(hex(back.notification.torabo.tunnel.blob), hex(blob));
  assert.equal(back.notification.core, undefined);
  console.log("OK  Notification(torabo tunnel 0x0f, 16B) =", hex(wire));
}

// --- 5. Regression: the untouched subsystems still encode identically.
{
  const bytes = Request.encode({ requestId: 1, core: { getDeviceInfo: true } }).finish();
  assert.equal(hex(bytes), "0801" + "1a02" + "0801"); // == tunnel_test.py cmd_ping
  console.log("OK  core.getDeviceInfo unchanged =", hex(bytes));
}
{
  const bytes = Request.encode({ requestId: 9, keymap: { getKeymap: true } }).finish();
  assert.equal(hex(bytes), "0809" + "2a02" + "0801");
  console.log("OK  keymap.getKeymap unchanged =", hex(bytes));
}
// An unknown trailing field must be skipped, not fatal — this is how a newer
// firmware adding to TunnelResponse stays readable here.
{
  const wire = Uint8Array.from([
    0x0a, 0x02, 0x08, 0x09, // tunnel { feature_id: 9 }
    0x18, 0x2a, //             field 3 varint 42, unknown to us
  ]);
  const back = ToraboRequest.decode(wire);
  assert.equal(back.tunnel.featureId, 9);
  console.log("OK  unknown field in torabo.Request is skipped");
}

// Direct message-level encode/decode of every new type.
for (const [name, T, msg] of [
  ["TunnelRequest", TunnelRequest, { featureId: 14, op: TunnelOp.ZMK_TORABO_TUNNEL_OP_UNSUBSCRIBE, blob: Uint8Array.from([9]) }],
  ["TunnelResponse", TunnelResponse, { status: TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_ERROR, blob: Uint8Array.from([9, 9]) }],
  ["TunnelNotification", TunnelNotification, { featureId: 15, blob: Uint8Array.from([]) }],
  ["torabo.Request", ToraboRequest, { tunnel: { featureId: 1, op: 0, blob: Uint8Array.from([]) } }],
  ["torabo.Response", ToraboResponse, { tunnel: { status: 2, blob: Uint8Array.from([7]) } }],
  ["torabo.Notification", ToraboNotification, { tunnel: { featureId: 15, blob: Uint8Array.from([1]) } }],
]) {
  const back = T.decode(T.encode(msg).finish());
  assert.deepEqual(T.toJSON(back), T.toJSON(T.fromPartial(msg)));
  console.log(`OK  ${name} encode/decode/toJSON/fromPartial`);
}

console.log("\nすべて通過");
