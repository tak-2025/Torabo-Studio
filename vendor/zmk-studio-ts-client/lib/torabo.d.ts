import * as _m0 from "protobufjs/minimal";
export declare const protobufPackage = "zmk.torabo";
export declare enum TunnelOp {
    ZMK_TORABO_TUNNEL_OP_READ = 0,
    ZMK_TORABO_TUNNEL_OP_WRITE = 1,
    ZMK_TORABO_TUNNEL_OP_SUBSCRIBE = 2,
    ZMK_TORABO_TUNNEL_OP_UNSUBSCRIBE = 3,
    UNRECOGNIZED = -1
}
export declare function tunnelOpFromJSON(object: any): TunnelOp;
export declare function tunnelOpToJSON(object: TunnelOp): string;
export declare enum TunnelStatus {
    ZMK_TORABO_TUNNEL_STATUS_OK = 0,
    ZMK_TORABO_TUNNEL_STATUS_UNSUPPORTED_FEATURE = 1,
    ZMK_TORABO_TUNNEL_STATUS_INVALID = 2,
    ZMK_TORABO_TUNNEL_STATUS_ERROR = 3,
    UNRECOGNIZED = -1
}
export declare function tunnelStatusFromJSON(object: any): TunnelStatus;
export declare function tunnelStatusToJSON(object: TunnelStatus): string;
export interface TunnelRequest {
    featureId: number;
    op: TunnelOp;
    blob: Uint8Array;
}
export interface TunnelResponse {
    status: TunnelStatus;
    blob: Uint8Array;
}
export interface TunnelNotification {
    featureId: number;
    blob: Uint8Array;
}
export interface Request {
    tunnel?: TunnelRequest | undefined;
}
export interface Response {
    tunnel?: TunnelResponse | undefined;
}
export interface Notification {
    tunnel?: TunnelNotification | undefined;
}
export declare const TunnelRequest: {
    encode(message: TunnelRequest, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number | undefined): TunnelRequest;
    fromJSON(object: any): TunnelRequest;
    toJSON(message: TunnelRequest): unknown;
    create<I extends {
        featureId?: number | undefined;
        op?: TunnelOp | undefined;
        blob?: Uint8Array | undefined;
    } & {
        featureId?: number | undefined;
        op?: TunnelOp | undefined;
        blob?: Uint8Array | undefined;
    } & { [K in Exclude<keyof I, keyof TunnelRequest>]: never; }>(base?: I | undefined): TunnelRequest;
    fromPartial<I_1 extends {
        featureId?: number | undefined;
        op?: TunnelOp | undefined;
        blob?: Uint8Array | undefined;
    } & {
        featureId?: number | undefined;
        op?: TunnelOp | undefined;
        blob?: Uint8Array | undefined;
    } & { [K_1 in Exclude<keyof I_1, keyof TunnelRequest>]: never; }>(object: I_1): TunnelRequest;
};
export declare const TunnelResponse: {
    encode(message: TunnelResponse, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number | undefined): TunnelResponse;
    fromJSON(object: any): TunnelResponse;
    toJSON(message: TunnelResponse): unknown;
    create<I extends {
        status?: TunnelStatus | undefined;
        blob?: Uint8Array | undefined;
    } & {
        status?: TunnelStatus | undefined;
        blob?: Uint8Array | undefined;
    } & { [K in Exclude<keyof I, keyof TunnelResponse>]: never; }>(base?: I | undefined): TunnelResponse;
    fromPartial<I_1 extends {
        status?: TunnelStatus | undefined;
        blob?: Uint8Array | undefined;
    } & {
        status?: TunnelStatus | undefined;
        blob?: Uint8Array | undefined;
    } & { [K_1 in Exclude<keyof I_1, keyof TunnelResponse>]: never; }>(object: I_1): TunnelResponse;
};
export declare const TunnelNotification: {
    encode(message: TunnelNotification, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number | undefined): TunnelNotification;
    fromJSON(object: any): TunnelNotification;
    toJSON(message: TunnelNotification): unknown;
    create<I extends {
        featureId?: number | undefined;
        blob?: Uint8Array | undefined;
    } & {
        featureId?: number | undefined;
        blob?: Uint8Array | undefined;
    } & { [K in Exclude<keyof I, keyof TunnelNotification>]: never; }>(base?: I | undefined): TunnelNotification;
    fromPartial<I_1 extends {
        featureId?: number | undefined;
        blob?: Uint8Array | undefined;
    } & {
        featureId?: number | undefined;
        blob?: Uint8Array | undefined;
    } & { [K_1 in Exclude<keyof I_1, keyof TunnelNotification>]: never; }>(object: I_1): TunnelNotification;
};
export declare const Request: {
    encode(message: Request, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number | undefined): Request;
    fromJSON(object: any): Request;
    toJSON(message: Request): unknown;
    create<I extends {
        tunnel?: {
            featureId?: number | undefined;
            op?: TunnelOp | undefined;
            blob?: Uint8Array | undefined;
        } | undefined;
    } & {
        tunnel?: ({
            featureId?: number | undefined;
            op?: TunnelOp | undefined;
            blob?: Uint8Array | undefined;
        } & {
            featureId?: number | undefined;
            op?: TunnelOp | undefined;
            blob?: Uint8Array | undefined;
        } & { [K in Exclude<keyof I["tunnel"], keyof TunnelRequest>]: never; }) | undefined;
    } & { [K_1 in Exclude<keyof I, "tunnel">]: never; }>(base?: I | undefined): Request;
    fromPartial<I_1 extends {
        tunnel?: {
            featureId?: number | undefined;
            op?: TunnelOp | undefined;
            blob?: Uint8Array | undefined;
        } | undefined;
    } & {
        tunnel?: ({
            featureId?: number | undefined;
            op?: TunnelOp | undefined;
            blob?: Uint8Array | undefined;
        } & {
            featureId?: number | undefined;
            op?: TunnelOp | undefined;
            blob?: Uint8Array | undefined;
        } & { [K_2 in Exclude<keyof I_1["tunnel"], keyof TunnelRequest>]: never; }) | undefined;
    } & { [K_3 in Exclude<keyof I_1, "tunnel">]: never; }>(object: I_1): Request;
};
export declare const Response: {
    encode(message: Response, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number | undefined): Response;
    fromJSON(object: any): Response;
    toJSON(message: Response): unknown;
    create<I extends {
        tunnel?: {
            status?: TunnelStatus | undefined;
            blob?: Uint8Array | undefined;
        } | undefined;
    } & {
        tunnel?: ({
            status?: TunnelStatus | undefined;
            blob?: Uint8Array | undefined;
        } & {
            status?: TunnelStatus | undefined;
            blob?: Uint8Array | undefined;
        } & { [K in Exclude<keyof I["tunnel"], keyof TunnelResponse>]: never; }) | undefined;
    } & { [K_1 in Exclude<keyof I, "tunnel">]: never; }>(base?: I | undefined): Response;
    fromPartial<I_1 extends {
        tunnel?: {
            status?: TunnelStatus | undefined;
            blob?: Uint8Array | undefined;
        } | undefined;
    } & {
        tunnel?: ({
            status?: TunnelStatus | undefined;
            blob?: Uint8Array | undefined;
        } & {
            status?: TunnelStatus | undefined;
            blob?: Uint8Array | undefined;
        } & { [K_2 in Exclude<keyof I_1["tunnel"], keyof TunnelResponse>]: never; }) | undefined;
    } & { [K_3 in Exclude<keyof I_1, "tunnel">]: never; }>(object: I_1): Response;
};
export declare const Notification: {
    encode(message: Notification, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number | undefined): Notification;
    fromJSON(object: any): Notification;
    toJSON(message: Notification): unknown;
    create<I extends {
        tunnel?: {
            featureId?: number | undefined;
            blob?: Uint8Array | undefined;
        } | undefined;
    } & {
        tunnel?: ({
            featureId?: number | undefined;
            blob?: Uint8Array | undefined;
        } & {
            featureId?: number | undefined;
            blob?: Uint8Array | undefined;
        } & { [K in Exclude<keyof I["tunnel"], keyof TunnelNotification>]: never; }) | undefined;
    } & { [K_1 in Exclude<keyof I, "tunnel">]: never; }>(base?: I | undefined): Notification;
    fromPartial<I_1 extends {
        tunnel?: {
            featureId?: number | undefined;
            blob?: Uint8Array | undefined;
        } | undefined;
    } & {
        tunnel?: ({
            featureId?: number | undefined;
            blob?: Uint8Array | undefined;
        } & {
            featureId?: number | undefined;
            blob?: Uint8Array | undefined;
        } & { [K_2 in Exclude<keyof I_1["tunnel"], keyof TunnelNotification>]: never; }) | undefined;
    } & { [K_3 in Exclude<keyof I_1, "tunnel">]: never; }>(object: I_1): Notification;
};
