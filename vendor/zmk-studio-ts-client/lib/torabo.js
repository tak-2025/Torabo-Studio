// Hand-written to match protoc-gen-ts_proto v1.180.0 output. See vendor README.
// versions:
//   protoc-gen-ts_proto  v1.180.0
//   protoc               v4.23.4
// source: torabo.proto
/* eslint-disable */
import * as _m0 from "protobufjs/minimal";
export const protobufPackage = "zmk.torabo";
export var TunnelOp;
(function (TunnelOp) {
    TunnelOp[TunnelOp["ZMK_TORABO_TUNNEL_OP_READ"] = 0] = "ZMK_TORABO_TUNNEL_OP_READ";
    TunnelOp[TunnelOp["ZMK_TORABO_TUNNEL_OP_WRITE"] = 1] = "ZMK_TORABO_TUNNEL_OP_WRITE";
    TunnelOp[TunnelOp["ZMK_TORABO_TUNNEL_OP_SUBSCRIBE"] = 2] = "ZMK_TORABO_TUNNEL_OP_SUBSCRIBE";
    TunnelOp[TunnelOp["ZMK_TORABO_TUNNEL_OP_UNSUBSCRIBE"] = 3] = "ZMK_TORABO_TUNNEL_OP_UNSUBSCRIBE";
    TunnelOp[TunnelOp["UNRECOGNIZED"] = -1] = "UNRECOGNIZED";
})(TunnelOp || (TunnelOp = {}));
export function tunnelOpFromJSON(object) {
    switch (object) {
        case 0:
        case "ZMK_TORABO_TUNNEL_OP_READ":
            return TunnelOp.ZMK_TORABO_TUNNEL_OP_READ;
        case 1:
        case "ZMK_TORABO_TUNNEL_OP_WRITE":
            return TunnelOp.ZMK_TORABO_TUNNEL_OP_WRITE;
        case 2:
        case "ZMK_TORABO_TUNNEL_OP_SUBSCRIBE":
            return TunnelOp.ZMK_TORABO_TUNNEL_OP_SUBSCRIBE;
        case 3:
        case "ZMK_TORABO_TUNNEL_OP_UNSUBSCRIBE":
            return TunnelOp.ZMK_TORABO_TUNNEL_OP_UNSUBSCRIBE;
        case -1:
        case "UNRECOGNIZED":
        default:
            return TunnelOp.UNRECOGNIZED;
    }
}
export function tunnelOpToJSON(object) {
    switch (object) {
        case TunnelOp.ZMK_TORABO_TUNNEL_OP_READ:
            return "ZMK_TORABO_TUNNEL_OP_READ";
        case TunnelOp.ZMK_TORABO_TUNNEL_OP_WRITE:
            return "ZMK_TORABO_TUNNEL_OP_WRITE";
        case TunnelOp.ZMK_TORABO_TUNNEL_OP_SUBSCRIBE:
            return "ZMK_TORABO_TUNNEL_OP_SUBSCRIBE";
        case TunnelOp.ZMK_TORABO_TUNNEL_OP_UNSUBSCRIBE:
            return "ZMK_TORABO_TUNNEL_OP_UNSUBSCRIBE";
        case TunnelOp.UNRECOGNIZED:
        default:
            return "UNRECOGNIZED";
    }
}
export var TunnelStatus;
(function (TunnelStatus) {
    TunnelStatus[TunnelStatus["ZMK_TORABO_TUNNEL_STATUS_OK"] = 0] = "ZMK_TORABO_TUNNEL_STATUS_OK";
    TunnelStatus[TunnelStatus["ZMK_TORABO_TUNNEL_STATUS_UNSUPPORTED_FEATURE"] = 1] =
        "ZMK_TORABO_TUNNEL_STATUS_UNSUPPORTED_FEATURE";
    TunnelStatus[TunnelStatus["ZMK_TORABO_TUNNEL_STATUS_INVALID"] = 2] = "ZMK_TORABO_TUNNEL_STATUS_INVALID";
    TunnelStatus[TunnelStatus["ZMK_TORABO_TUNNEL_STATUS_ERROR"] = 3] = "ZMK_TORABO_TUNNEL_STATUS_ERROR";
    TunnelStatus[TunnelStatus["UNRECOGNIZED"] = -1] = "UNRECOGNIZED";
})(TunnelStatus || (TunnelStatus = {}));
export function tunnelStatusFromJSON(object) {
    switch (object) {
        case 0:
        case "ZMK_TORABO_TUNNEL_STATUS_OK":
            return TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_OK;
        case 1:
        case "ZMK_TORABO_TUNNEL_STATUS_UNSUPPORTED_FEATURE":
            return TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_UNSUPPORTED_FEATURE;
        case 2:
        case "ZMK_TORABO_TUNNEL_STATUS_INVALID":
            return TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_INVALID;
        case 3:
        case "ZMK_TORABO_TUNNEL_STATUS_ERROR":
            return TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_ERROR;
        case -1:
        case "UNRECOGNIZED":
        default:
            return TunnelStatus.UNRECOGNIZED;
    }
}
export function tunnelStatusToJSON(object) {
    switch (object) {
        case TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_OK:
            return "ZMK_TORABO_TUNNEL_STATUS_OK";
        case TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_UNSUPPORTED_FEATURE:
            return "ZMK_TORABO_TUNNEL_STATUS_UNSUPPORTED_FEATURE";
        case TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_INVALID:
            return "ZMK_TORABO_TUNNEL_STATUS_INVALID";
        case TunnelStatus.ZMK_TORABO_TUNNEL_STATUS_ERROR:
            return "ZMK_TORABO_TUNNEL_STATUS_ERROR";
        case TunnelStatus.UNRECOGNIZED:
        default:
            return "UNRECOGNIZED";
    }
}
function createBaseTunnelRequest() {
    return { featureId: 0, op: 0, blob: new Uint8Array(0) };
}
export const TunnelRequest = {
    encode(message, writer = _m0.Writer.create()) {
        if (message.featureId !== 0) {
            writer.uint32(8).uint32(message.featureId);
        }
        if (message.op !== 0) {
            writer.uint32(16).int32(message.op);
        }
        if (message.blob.length !== 0) {
            writer.uint32(26).bytes(message.blob);
        }
        return writer;
    },
    decode(input, length) {
        const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
        let end = length === undefined ? reader.len : reader.pos + length;
        const message = createBaseTunnelRequest();
        while (reader.pos < end) {
            const tag = reader.uint32();
            switch (tag >>> 3) {
                case 1:
                    if (tag !== 8) {
                        break;
                    }
                    message.featureId = reader.uint32();
                    continue;
                case 2:
                    if (tag !== 16) {
                        break;
                    }
                    message.op = reader.int32();
                    continue;
                case 3:
                    if (tag !== 26) {
                        break;
                    }
                    message.blob = reader.bytes();
                    continue;
            }
            if ((tag & 7) === 4 || tag === 0) {
                break;
            }
            reader.skipType(tag & 7);
        }
        return message;
    },
    fromJSON(object) {
        return {
            featureId: isSet(object.featureId) ? globalThis.Number(object.featureId) : 0,
            op: isSet(object.op) ? tunnelOpFromJSON(object.op) : 0,
            blob: isSet(object.blob) ? bytesFromBase64(object.blob) : new Uint8Array(0),
        };
    },
    toJSON(message) {
        const obj = {};
        if (message.featureId !== 0) {
            obj.featureId = Math.round(message.featureId);
        }
        if (message.op !== 0) {
            obj.op = tunnelOpToJSON(message.op);
        }
        if (message.blob.length !== 0) {
            obj.blob = base64FromBytes(message.blob);
        }
        return obj;
    },
    create(base) {
        return TunnelRequest.fromPartial(base ?? {});
    },
    fromPartial(object) {
        const message = createBaseTunnelRequest();
        message.featureId = object.featureId ?? 0;
        message.op = object.op ?? 0;
        message.blob = object.blob ?? new Uint8Array(0);
        return message;
    },
};
function createBaseTunnelResponse() {
    return { status: 0, blob: new Uint8Array(0) };
}
export const TunnelResponse = {
    encode(message, writer = _m0.Writer.create()) {
        if (message.status !== 0) {
            writer.uint32(8).int32(message.status);
        }
        if (message.blob.length !== 0) {
            writer.uint32(18).bytes(message.blob);
        }
        return writer;
    },
    decode(input, length) {
        const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
        let end = length === undefined ? reader.len : reader.pos + length;
        const message = createBaseTunnelResponse();
        while (reader.pos < end) {
            const tag = reader.uint32();
            switch (tag >>> 3) {
                case 1:
                    if (tag !== 8) {
                        break;
                    }
                    message.status = reader.int32();
                    continue;
                case 2:
                    if (tag !== 18) {
                        break;
                    }
                    message.blob = reader.bytes();
                    continue;
            }
            if ((tag & 7) === 4 || tag === 0) {
                break;
            }
            reader.skipType(tag & 7);
        }
        return message;
    },
    fromJSON(object) {
        return {
            status: isSet(object.status) ? tunnelStatusFromJSON(object.status) : 0,
            blob: isSet(object.blob) ? bytesFromBase64(object.blob) : new Uint8Array(0),
        };
    },
    toJSON(message) {
        const obj = {};
        if (message.status !== 0) {
            obj.status = tunnelStatusToJSON(message.status);
        }
        if (message.blob.length !== 0) {
            obj.blob = base64FromBytes(message.blob);
        }
        return obj;
    },
    create(base) {
        return TunnelResponse.fromPartial(base ?? {});
    },
    fromPartial(object) {
        const message = createBaseTunnelResponse();
        message.status = object.status ?? 0;
        message.blob = object.blob ?? new Uint8Array(0);
        return message;
    },
};
function createBaseTunnelNotification() {
    return { featureId: 0, blob: new Uint8Array(0) };
}
export const TunnelNotification = {
    encode(message, writer = _m0.Writer.create()) {
        if (message.featureId !== 0) {
            writer.uint32(8).uint32(message.featureId);
        }
        if (message.blob.length !== 0) {
            writer.uint32(18).bytes(message.blob);
        }
        return writer;
    },
    decode(input, length) {
        const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
        let end = length === undefined ? reader.len : reader.pos + length;
        const message = createBaseTunnelNotification();
        while (reader.pos < end) {
            const tag = reader.uint32();
            switch (tag >>> 3) {
                case 1:
                    if (tag !== 8) {
                        break;
                    }
                    message.featureId = reader.uint32();
                    continue;
                case 2:
                    if (tag !== 18) {
                        break;
                    }
                    message.blob = reader.bytes();
                    continue;
            }
            if ((tag & 7) === 4 || tag === 0) {
                break;
            }
            reader.skipType(tag & 7);
        }
        return message;
    },
    fromJSON(object) {
        return {
            featureId: isSet(object.featureId) ? globalThis.Number(object.featureId) : 0,
            blob: isSet(object.blob) ? bytesFromBase64(object.blob) : new Uint8Array(0),
        };
    },
    toJSON(message) {
        const obj = {};
        if (message.featureId !== 0) {
            obj.featureId = Math.round(message.featureId);
        }
        if (message.blob.length !== 0) {
            obj.blob = base64FromBytes(message.blob);
        }
        return obj;
    },
    create(base) {
        return TunnelNotification.fromPartial(base ?? {});
    },
    fromPartial(object) {
        const message = createBaseTunnelNotification();
        message.featureId = object.featureId ?? 0;
        message.blob = object.blob ?? new Uint8Array(0);
        return message;
    },
};
function createBaseRequest() {
    return { tunnel: undefined };
}
export const Request = {
    encode(message, writer = _m0.Writer.create()) {
        if (message.tunnel !== undefined) {
            TunnelRequest.encode(message.tunnel, writer.uint32(10).fork()).ldelim();
        }
        return writer;
    },
    decode(input, length) {
        const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
        let end = length === undefined ? reader.len : reader.pos + length;
        const message = createBaseRequest();
        while (reader.pos < end) {
            const tag = reader.uint32();
            switch (tag >>> 3) {
                case 1:
                    if (tag !== 10) {
                        break;
                    }
                    message.tunnel = TunnelRequest.decode(reader, reader.uint32());
                    continue;
            }
            if ((tag & 7) === 4 || tag === 0) {
                break;
            }
            reader.skipType(tag & 7);
        }
        return message;
    },
    fromJSON(object) {
        return { tunnel: isSet(object.tunnel) ? TunnelRequest.fromJSON(object.tunnel) : undefined };
    },
    toJSON(message) {
        const obj = {};
        if (message.tunnel !== undefined) {
            obj.tunnel = TunnelRequest.toJSON(message.tunnel);
        }
        return obj;
    },
    create(base) {
        return Request.fromPartial(base ?? {});
    },
    fromPartial(object) {
        const message = createBaseRequest();
        message.tunnel = (object.tunnel !== undefined && object.tunnel !== null)
            ? TunnelRequest.fromPartial(object.tunnel)
            : undefined;
        return message;
    },
};
function createBaseResponse() {
    return { tunnel: undefined };
}
export const Response = {
    encode(message, writer = _m0.Writer.create()) {
        if (message.tunnel !== undefined) {
            TunnelResponse.encode(message.tunnel, writer.uint32(10).fork()).ldelim();
        }
        return writer;
    },
    decode(input, length) {
        const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
        let end = length === undefined ? reader.len : reader.pos + length;
        const message = createBaseResponse();
        while (reader.pos < end) {
            const tag = reader.uint32();
            switch (tag >>> 3) {
                case 1:
                    if (tag !== 10) {
                        break;
                    }
                    message.tunnel = TunnelResponse.decode(reader, reader.uint32());
                    continue;
            }
            if ((tag & 7) === 4 || tag === 0) {
                break;
            }
            reader.skipType(tag & 7);
        }
        return message;
    },
    fromJSON(object) {
        return { tunnel: isSet(object.tunnel) ? TunnelResponse.fromJSON(object.tunnel) : undefined };
    },
    toJSON(message) {
        const obj = {};
        if (message.tunnel !== undefined) {
            obj.tunnel = TunnelResponse.toJSON(message.tunnel);
        }
        return obj;
    },
    create(base) {
        return Response.fromPartial(base ?? {});
    },
    fromPartial(object) {
        const message = createBaseResponse();
        message.tunnel = (object.tunnel !== undefined && object.tunnel !== null)
            ? TunnelResponse.fromPartial(object.tunnel)
            : undefined;
        return message;
    },
};
function createBaseNotification() {
    return { tunnel: undefined };
}
export const Notification = {
    encode(message, writer = _m0.Writer.create()) {
        if (message.tunnel !== undefined) {
            TunnelNotification.encode(message.tunnel, writer.uint32(10).fork()).ldelim();
        }
        return writer;
    },
    decode(input, length) {
        const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
        let end = length === undefined ? reader.len : reader.pos + length;
        const message = createBaseNotification();
        while (reader.pos < end) {
            const tag = reader.uint32();
            switch (tag >>> 3) {
                case 1:
                    if (tag !== 10) {
                        break;
                    }
                    message.tunnel = TunnelNotification.decode(reader, reader.uint32());
                    continue;
            }
            if ((tag & 7) === 4 || tag === 0) {
                break;
            }
            reader.skipType(tag & 7);
        }
        return message;
    },
    fromJSON(object) {
        return { tunnel: isSet(object.tunnel) ? TunnelNotification.fromJSON(object.tunnel) : undefined };
    },
    toJSON(message) {
        const obj = {};
        if (message.tunnel !== undefined) {
            obj.tunnel = TunnelNotification.toJSON(message.tunnel);
        }
        return obj;
    },
    create(base) {
        return Notification.fromPartial(base ?? {});
    },
    fromPartial(object) {
        const message = createBaseNotification();
        message.tunnel = (object.tunnel !== undefined && object.tunnel !== null)
            ? TunnelNotification.fromPartial(object.tunnel)
            : undefined;
        return message;
    },
};
function bytesFromBase64(b64) {
    const bin = globalThis.atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; ++i) {
        arr[i] = bin.charCodeAt(i);
    }
    return arr;
}
function base64FromBytes(arr) {
    const bin = [];
    arr.forEach((byte) => {
        bin.push(globalThis.String.fromCharCode(byte));
    });
    return globalThis.btoa(bin.join(""));
}
function isSet(value) {
    return value !== null && value !== undefined;
}
