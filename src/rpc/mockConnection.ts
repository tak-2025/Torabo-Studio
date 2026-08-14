import {
  Request,
  RequestResponse,
  RpcConnection,
} from "@zmkfirmware/zmk-studio-ts-client";

/**
 * A fake RpcConnection for Storybook.
 *
 * Panels gate on `conn` being truthy and then ask the keyboard for context the
 * config wire does not carry — layer names (`keymap.getKeymap`) and the physical
 * layout (`keymap.getPhysicalLayouts`). A bare `{}` dummy makes those calls fail
 * and the panels fall back to bare indices, which hides half the UI. This answers
 * them from canned data instead, so a story can show the panel as a connected
 * keyboard would.
 *
 * `handle` returns the response body (everything but `requestId`), or null to
 * leave the request unanswered — call_rpc then times out and the caller takes its
 * error path, which is also worth exercising.
 */
export function mockRpcConnection(
  handle: (req: Request) => Record<string, unknown> | null
): RpcConnection {
  let push: ((r: RequestResponse) => void) | null = null;

  const request_response_readable = new ReadableStream<RequestResponse>({
    start(controller) {
      push = (r) => controller.enqueue(r);
    },
  });

  const request_writable = new WritableStream<Request>({
    write(req) {
      const body = handle(req);
      if (!body) return;
      push?.({ requestId: req.requestId, ...body } as unknown as RequestResponse);
    },
  });

  return {
    label: "storybook-mock",
    request_response_readable,
    request_writable,
    notification_readable: new ReadableStream(),
    current_request: 0,
  } as unknown as RpcConnection;
}

/** Layer names a story wants to show, as `keymap.getKeymap` would report them. */
export function keymapLayersResponse(names: string[]) {
  return {
    keymap: {
      getKeymap: {
        layers: names.map((name, id) => ({ id, name, bindings: [] })),
      },
    },
  };
}

/** Geometry as `keymap.getPhysicalLayouts` would report it (centi-units). */
export function physicalLayoutsResponse(
  layouts: { name: string; keys: unknown[] }[],
  activeLayoutIndex = 0
) {
  return { keymap: { getPhysicalLayouts: { layouts, activeLayoutIndex } } };
}
