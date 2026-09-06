import React, {
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Request } from "@zmkfirmware/zmk-studio-ts-client";
import { call_rpc } from "../rpc/logging";
import {
  PhysicalLayout,
  Keymap,
  SetLayerBindingResponse,
  SetLayerPropsResponse,
  BehaviorBinding,
  Layer,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import { X } from "lucide-react";

import { LayerPicker } from "./LayerPicker";
import { PhysicalLayoutPicker } from "./PhysicalLayoutPicker";
import { Keymap as KeymapComp } from "./Keymap";
import { useConnectedDeviceData } from "../rpc/useConnectedDeviceData";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { UndoRedoContext } from "../undoRedo";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { produce } from "immer";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { deserializeLayoutZoom, LayoutZoom } from "./PhysicalLayout";
import { useLocalStorageState } from "../misc/useLocalStorageState";
import { useSyncStep } from "../rpc/SyncStatusContext";
import { useT } from "../i18n";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

function useBehaviors(): BehaviorMap {
  let connection = useContext(ConnectionContext);
  let lockState = useContext(LockStateContext);

  const [behaviors, setBehaviors] = useState<BehaviorMap>({});

  useEffect(() => {
    if (
      !connection.conn ||
      lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    ) {
      setBehaviors({});
      return;
    }

    const MAX_ATTEMPTS = 5;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Fetch the full behavior set once. Returns the map only if every behavior's
    // details loaded; returns null to signal the caller should retry (e.g. an
    // RPC was disrupted by concurrent HID traffic).
    async function fetchOnce(): Promise<BehaviorMap | null> {
      if (!connection.conn) {
        return null;
      }

      let get_behaviors: Request = {
        behaviors: { listAllBehaviors: true },
        requestId: 0,
      };

      let behavior_list = await call_rpc(connection.conn, get_behaviors);
      const behaviorIds =
        behavior_list.behaviors?.listAllBehaviors?.behaviors || [];
      if (behaviorIds.length === 0) {
        return null;
      }

      let behavior_map: BehaviorMap = {};
      for (let behaviorId of behaviorIds) {
        if (ignore || !connection.conn) {
          return null;
        }
        let details_req = {
          behaviors: { getBehaviorDetails: { behaviorId } },
          requestId: 0,
        };
        let behavior_details = await call_rpc(connection.conn, details_req);
        let dets: GetBehaviorDetailsResponse | undefined =
          behavior_details?.behaviors?.getBehaviorDetails;

        if (dets) {
          behavior_map[dets.id] = dets;
        } else {
          // A missing detail means the exchange was disrupted; retry the whole
          // set rather than rendering a half-resolved keymap.
          console.warn(
            `[behaviors] no details for behaviorId ${behaviorId} — will retry`,
            behavior_details
          );
          return null;
        }
      }

      console.warn(
        `[behaviors] loaded ${behaviorIds.length}/${behaviorIds.length} behavior detail(s)`
      );
      return behavior_map;
    }

    async function startRequest() {
      setBehaviors({});

      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ignore; attempt++) {
        console.warn(`[behaviors] fetch attempt ${attempt}/${MAX_ATTEMPTS}`);
        let map: BehaviorMap | null = null;
        try {
          map = await fetchOnce();
        } catch (e) {
          console.warn(`[behaviors] attempt ${attempt} threw`, e);
        }
        if (ignore) {
          return;
        }
        if (map) {
          setBehaviors(map);
          return;
        }
        await sleep(400);
      }
      console.warn(
        `[behaviors] gave up after ${MAX_ATTEMPTS} attempts — some keys may show "Unknown"`
      );
    }

    let ignore = false;
    startRequest();

    return () => {
      ignore = true;
    };
  }, [connection, lockState]);

  return behaviors;
}

function useLayouts(): [
  PhysicalLayout[] | undefined,
  React.Dispatch<SetStateAction<PhysicalLayout[] | undefined>>,
  number,
  React.Dispatch<SetStateAction<number>>
] {
  let connection = useContext(ConnectionContext);
  let lockState = useContext(LockStateContext);

  const [layouts, setLayouts] = useState<PhysicalLayout[] | undefined>(
    undefined
  );
  const [selectedPhysicalLayoutIndex, setSelectedPhysicalLayoutIndex] =
    useState<number>(0);

  useEffect(() => {
    if (
      !connection.conn ||
      lockState != LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    ) {
      setLayouts(undefined);
      return;
    }

    async function startRequest() {
      setLayouts(undefined);

      if (!connection.conn) {
        return;
      }

      let response = await call_rpc(connection.conn, {
        keymap: { getPhysicalLayouts: true },
      });

      if (!ignore) {
        setLayouts(response?.keymap?.getPhysicalLayouts?.layouts);
        setSelectedPhysicalLayoutIndex(
          response?.keymap?.getPhysicalLayouts?.activeLayoutIndex || 0
        );
      }
    }

    let ignore = false;
    startRequest();

    return () => {
      ignore = true;
    };
  }, [connection, lockState]);

  return [
    layouts,
    setLayouts,
    selectedPhysicalLayoutIndex,
    setSelectedPhysicalLayoutIndex,
  ];
}

export default function Keyboard() {
  const [
    layouts,
    _setLayouts,
    selectedPhysicalLayoutIndex,
    setSelectedPhysicalLayoutIndex,
  ] = useLayouts();
  const [keymap, setKeymap] = useConnectedDeviceData<Keymap>(
    { keymap: { getKeymap: true } },
    (keymap) => {
      console.log("Got the keymap!");
      return keymap?.keymap?.getKeymap;
    },
    true
  );

  const [keymapScale, setKeymapScale] = useLocalStorageState<LayoutZoom>("keymapScale", "auto", {
    deserialize: deserializeLayoutZoom,
  });

  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number>(0);
  const [selectedKeyPosition, setSelectedKeyPosition] = useState<
    number | undefined
  >(undefined);
  const behaviors = useBehaviors();

  const t = useT();
  const conn = useContext(ConnectionContext);
  const undoRedo = useContext(UndoRedoContext);

  // Reported to the header's initial-sync status line (rpc/SyncStatusContext).
  // `keymap === undefined` is exactly useConnectedDeviceData's own "still
  // loading" state (it resets to undefined on every new connection before the
  // getKeymap response lands) — no separate loading flag needed.
  useSyncStep(!!conn.conn && keymap === undefined, "keymap");

  useEffect(() => {
    setSelectedLayerIndex(0);
    setSelectedKeyPosition(undefined);
  }, [conn]);

  useEffect(() => {
    async function performSetRequest() {
      if (!conn.conn || !layouts) {
        return;
      }

      let resp = await call_rpc(conn.conn, {
        keymap: { setActivePhysicalLayout: selectedPhysicalLayoutIndex },
      });

      let new_keymap = resp?.keymap?.setActivePhysicalLayout?.ok;
      if (new_keymap) {
        setKeymap(new_keymap);
      } else {
        console.error(
          "Failed to set the active physical layout err:",
          resp?.keymap?.setActivePhysicalLayout?.err
        );
      }
    }

    performSetRequest();
  }, [selectedPhysicalLayoutIndex]);

  let doSelectPhysicalLayout = useCallback(
    (i: number) => {
      let oldLayout = selectedPhysicalLayoutIndex;
      undoRedo?.(async () => {
        setSelectedPhysicalLayoutIndex(i);

        return async () => {
          setSelectedPhysicalLayoutIndex(oldLayout);
        };
      });
    },
    [undoRedo, selectedPhysicalLayoutIndex]
  );

  /**
   * Apply the picker's new binding, and say whether it actually landed.
   *
   * The boolean is the picker's rollback contract (BindingChangeResult in
   * BehaviorBindingPicker.tsx): a keyboard that refuses setLayerBinding used to
   * leave the picker showing the rejected choice, so the user read a refusal as
   * a save. Now the picker puts its dropdowns back to the binding that is
   * really on the keyboard.
   */
  let doUpdateBinding = useCallback(
    async (binding: BehaviorBinding): Promise<boolean> => {
      if (!keymap || selectedKeyPosition === undefined) {
        console.error(
          "Can't update binding without a selected key position and loaded keymap"
        );
        return false;
      }

      const layer = selectedLayerIndex;
      const layerId = keymap.layers[layer].id;
      const keyPosition = selectedKeyPosition;
      const oldBinding = keymap.layers[layer].bindings[keyPosition];
      let applied = false;
      await undoRedo?.(async () => {
        if (!conn.conn) {
          throw new Error("Not connected");
        }

        let resp = await call_rpc(conn.conn, {
          keymap: { setLayerBinding: { layerId, keyPosition, binding } },
        });

        if (
          resp.keymap?.setLayerBinding ===
          SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK
        ) {
          applied = true;
          setKeymap(
            produce((draft: any) => {
              draft.layers[layer].bindings[keyPosition] = binding;
            })
          );
        } else {
          console.error("Failed to set binding", resp.keymap?.setLayerBinding);
        }

        return async () => {
          if (!conn.conn) {
            return;
          }

          let resp = await call_rpc(conn.conn, {
            keymap: {
              setLayerBinding: { layerId, keyPosition, binding: oldBinding },
            },
          });
          if (
            resp.keymap?.setLayerBinding ===
            SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK
          ) {
            setKeymap(
              produce((draft: any) => {
                draft.layers[layer].bindings[keyPosition] = oldBinding;
              })
            );
          } else {
          }
        };
      });
      return applied;
    },
    [conn, keymap, undoRedo, selectedLayerIndex, selectedKeyPosition]
  );

  let selectedBinding = useMemo(() => {
    if (keymap == null || selectedKeyPosition == null || !keymap.layers[selectedLayerIndex]) {
      return null;
    }

    return keymap.layers[selectedLayerIndex].bindings[selectedKeyPosition];
  }, [keymap, selectedLayerIndex, selectedKeyPosition]);

  const moveLayer = useCallback(
    (start: number, end: number) => {
      const doMove = async (startIndex: number, destIndex: number) => {
        if (!conn.conn) {
          return;
        }

        let resp = await call_rpc(conn.conn, {
          keymap: { moveLayer: { startIndex, destIndex } },
        });

        if (resp.keymap?.moveLayer?.ok) {
          setKeymap(resp.keymap?.moveLayer?.ok);
          setSelectedLayerIndex(destIndex);
        } else {
          console.error("Error moving", resp);
        }
      };

      undoRedo?.(async () => {
        await doMove(start, end);
        return () => doMove(end, start);
      });
    },
    [undoRedo]
  );

  const addLayer = useCallback(() => {
    async function doAdd(): Promise<number> {
      if (!conn.conn || !keymap) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, { keymap: { addLayer: {} } });

      if (resp.keymap?.addLayer?.ok) {
        const newSelection = keymap.layers.length;
        setKeymap(
          produce((draft: any) => {
            draft.layers.push(resp.keymap!.addLayer!.ok!.layer);
            draft.availableLayers--;
          })
        );

        setSelectedLayerIndex(newSelection);

        return resp.keymap.addLayer.ok.index;
      } else {
        console.error("Add error", resp.keymap?.addLayer?.err);
        throw new Error("Failed to add layer:" + resp.keymap?.addLayer?.err);
      }
    }

    async function doRemove(layerIndex: number) {
      if (!conn.conn) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { removeLayer: { layerIndex } },
      });

      console.log(resp);
      if (resp.keymap?.removeLayer?.ok) {
        setKeymap(
          produce((draft: any) => {
            draft.layers.splice(layerIndex, 1);
            draft.availableLayers++;
          })
        );
      } else {
        console.error("Remove error", resp.keymap?.removeLayer?.err);
        throw new Error(
          "Failed to remove layer:" + resp.keymap?.removeLayer?.err
        );
      }
    }

    undoRedo?.(async () => {
      let index = await doAdd();
      return () => doRemove(index);
    });
  }, [conn, undoRedo, keymap]);

  const removeLayer = useCallback(() => {
    async function doRemove(layerIndex: number): Promise<void> {
      if (!conn.conn || !keymap) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { removeLayer: { layerIndex } },
      });

      if (resp.keymap?.removeLayer?.ok) {
        if (layerIndex == keymap.layers.length - 1) {
          setSelectedLayerIndex(layerIndex - 1);
        }
        setKeymap(
          produce((draft: any) => {
            draft.layers.splice(layerIndex, 1);
            draft.availableLayers++;
          })
        );
      } else {
        console.error("Remove error", resp.keymap?.removeLayer?.err);
        throw new Error(
          "Failed to remove layer:" + resp.keymap?.removeLayer?.err
        );
      }
    }

    async function doRestore(layerId: number, atIndex: number) {
      if (!conn.conn) {
        throw new Error("Not connected");
      }

      const resp = await call_rpc(conn.conn, {
        keymap: { restoreLayer: { layerId, atIndex } },
      });

      console.log(resp);
      if (resp.keymap?.restoreLayer?.ok) {
        setKeymap(
          produce((draft: any) => {
            draft.layers.splice(atIndex, 0, resp!.keymap!.restoreLayer!.ok);
            draft.availableLayers--;
          })
        );
        setSelectedLayerIndex(atIndex);
      } else {
        console.error("Remove error", resp.keymap?.restoreLayer?.err);
        throw new Error(
          "Failed to restore layer:" + resp.keymap?.restoreLayer?.err
        );
      }
    }

    if (!keymap) {
      throw new Error("No keymap loaded");
    }

    let index = selectedLayerIndex;
    let layerId = keymap.layers[index].id;
    undoRedo?.(async () => {
      await doRemove(index);
      return () => doRestore(layerId, index);
    });
  }, [conn, undoRedo, selectedLayerIndex]);

  const changeLayerName = useCallback(
    (id: number, oldName: string, newName: string) => {
      async function changeName(layerId: number, name: string) {
        if (!conn.conn) {
          throw new Error("Not connected");
        }

        const resp = await call_rpc(conn.conn, {
          keymap: { setLayerProps: { layerId, name } },
        });

        if (
          resp.keymap?.setLayerProps ==
          SetLayerPropsResponse.SET_LAYER_PROPS_RESP_OK
        ) {
          setKeymap(
            produce((draft: any) => {
              const layer_index = draft.layers.findIndex(
                (l: Layer) => l.id == layerId
              );
              draft.layers[layer_index].name = name;
            })
          );
        } else {
          throw new Error(
            "Failed to change layer name:" + resp.keymap?.setLayerProps
          );
        }
      }

      undoRedo?.(async () => {
        await changeName(id, newName);
        return async () => {
          await changeName(id, oldName);
        };
      });
    },
    [conn, undoRedo, keymap]
  );

  useEffect(() => {
    if (!keymap?.layers) return;

    const layers = keymap.layers.length - 1;

    if (selectedLayerIndex > layers) {
      setSelectedLayerIndex(layers);
    }
  }, [keymap, selectedLayerIndex]);

  // Pre-connect guidance, same pattern as the other panels (added after Phase E
  // found this tab rendered a blank panel before a keyboard is connected).
  if (!conn.conn) {
    return (
      <div className="p-4 text-base-content/70">
        {t("preconnect.keymap")} {t("preconnect.howto")}
      </div>
    );
  }

  return (
    /*
      Two columns on a desktop: pickers down the left, board on the right.
      One column on a touch screen. The left column is sized `auto`, so with the
      layer list laid out as a row of chips it grew to fit them and took the
      width the board needed — the board ended up a thumbnail beside a very
      large list. Stacking puts the pickers in a strip across the top and gives
      the board the whole width below.
    */
    <div className="grid grid-cols-[auto_1fr] grid-rows-[1fr_minmax(10em,auto)] pointer-coarse:grid-cols-1 pointer-coarse:grid-rows-[auto_1fr] bg-base-300 max-w-full min-w-0 min-h-0">
      <div className="p-2 flex flex-col gap-2 bg-base-200 row-span-2 pointer-coarse:row-span-1 pointer-coarse:col-start-1 pointer-coarse:row-start-1 pointer-coarse:flex-row pointer-coarse:flex-wrap pointer-coarse:items-start pointer-coarse:gap-x-4">
        {layouts && (
          <div className="col-start-3 row-start-1 row-end-2">
            <PhysicalLayoutPicker
              layouts={layouts}
              selectedPhysicalLayoutIndex={selectedPhysicalLayoutIndex}
              onPhysicalLayoutClicked={doSelectPhysicalLayout}
            />
          </div>
        )}

        {keymap && (
          <div className="col-start-1 row-start-1 row-end-2">
            <LayerPicker
              layers={keymap.layers}
              selectedLayerIndex={selectedLayerIndex}
              onLayerClicked={setSelectedLayerIndex}
              onLayerMoved={moveLayer}
              canAdd={(keymap.availableLayers || 0) > 0}
              canRemove={(keymap.layers?.length || 0) > 1}
              onAddClicked={addLayer}
              onRemoveClicked={removeLayer}
              onLayerNameChanged={changeLayerName}
            />
          </div>
        )}
      </div>
      {layouts && keymap && behaviors && (
        /*
          min-h-0 is load-bearing. This cell sits in a `1fr` row, and a grid
          item defaults to `min-height: auto` — it refuses to shrink below its
          content. So the row grew to whatever the board wanted, the app's
          outer `overflow-hidden` cut off the bottom, and auto-zoom kept
          measuring the grown height and never scaled down: the board was
          simply clipped. overflow-auto is the backstop for the case where it
          still cannot fit.
        */
        <div className="p-2 col-start-2 row-start-1 pointer-coarse:col-start-1 pointer-coarse:row-start-2 grid items-center justify-center relative min-w-0 min-h-0 overflow-auto">
          <KeymapComp
            keymap={keymap}
            layout={layouts[selectedPhysicalLayoutIndex]}
            behaviors={behaviors}
            scale={keymapScale}
            selectedLayerIndex={selectedLayerIndex}
            selectedKeyPosition={selectedKeyPosition}
            onKeyPositionClicked={setSelectedKeyPosition}
          />
          <select
            aria-label={t("scale.auto")}
            className="absolute top-2 right-2 h-8 rounded px-2"
            value={keymapScale}
            onChange={(e) => {
              const value = deserializeLayoutZoom(e.target.value);
              setKeymapScale(value);
            }}
          >
            <option value="auto">{t("scale.auto")}</option>
            <option value={0.25}>25%</option>
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
          </select>
        </div>
      )}
      {keymap && selectedBinding && (
        /*
          A panel under the board on a desktop; a sheet over it on a touch
          screen. Inline, the editor needs a permanent strip at the bottom —
          and it is only useful while a key is selected, so on a phone that
          strip spent most of its life empty while the board went without it.
          As a fixed sheet it is out of flow entirely: the board gets the whole
          screen, and the editor covers it only while it is being used.
        */
        <div className="p-2 col-start-2 row-start-2 bg-base-200 pointer-coarse:fixed pointer-coarse:inset-x-0 pointer-coarse:bottom-0 pointer-coarse:z-30 pointer-coarse:max-h-[60vh] pointer-coarse:overflow-y-auto pointer-coarse:rounded-t-xl pointer-coarse:shadow-[0_-6px_20px_rgba(0,0,0,0.35)]">
          <button
            type="button"
            className="hidden pointer-coarse:flex float-right size-11 items-center justify-center rounded hover:bg-base-300"
            aria-label={t("common.close")}
            onClick={() => setSelectedKeyPosition(undefined)}
          >
            <X className="size-5" />
          </button>
          {Object.keys(behaviors).length === 0 && (
            // The picker renders an empty dropdown and no parameter fields when
            // the behavior list never arrived, which reads as "the editor is
            // broken" rather than "the keyboard has not answered yet".
            <p className="text-sm text-base-content/70">
              {t("behavior.unavailable")}
            </p>
          )}
          <BehaviorBindingPicker
            binding={selectedBinding}
            behaviors={Object.values(behaviors)}
            layers={keymap.layers.map(({ id, name }, li) => ({
              id,
              name: name || li.toLocaleString(),
            }))}
            onBindingChanged={doUpdateBinding}
          />
        </div>
      )}
    </div>
  );
}
