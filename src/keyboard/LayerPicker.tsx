import { Pencil, Minus, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  DropIndicator,
  Label,
  ListBox,
  ListBoxItem,
  Selection,
  useDragAndDrop,
} from "react-aria-components";
import { useModalRef } from "../misc/useModalRef";
import { GenericModal } from "../GenericModal";
import { useT } from "../i18n";

interface Layer {
  id: number;
  name?: string;
}

export type LayerClickCallback = (index: number) => void;
export type LayerMovedCallback = (index: number, destination: number) => void;

interface LayerPickerProps {
  layers: Array<Layer>;
  selectedLayerIndex: number;
  canAdd?: boolean;
  canRemove?: boolean;

  onLayerClicked?: LayerClickCallback;
  onLayerMoved?: LayerMovedCallback;
  onAddClicked?: () => void | Promise<void>;
  onRemoveClicked?: () => void | Promise<void>;
  onLayerNameChanged?: (
    id: number,
    oldName: string,
    newName: string
  ) => void | Promise<void>;
}

interface EditLabelData {
  id: number;
  name: string;
}

const EditLabelModal = ({
  open,
  onClose,
  editLabelData,
  handleSaveNewLabel,
}: {
  open: boolean;
  onClose: () => void;
  editLabelData: EditLabelData;
  handleSaveNewLabel: (
    id: number,
    oldName: string,
    newName: string | null
  ) => void;
}) => {
  const t = useT();
  const ref = useModalRef(open);
  const [newLabelName, setNewLabelName] = useState(editLabelData.name);

  const handleSave = () => {
    handleSaveNewLabel(editLabelData.id, editLabelData.name, newLabelName);
    onClose();
  };

  return (
    <GenericModal
      ref={ref}
      onClose={onClose}
      className="min-w-min w-[30vw] flex flex-col"
    >
      <span className="mb-3 text-lg">{t("layer.newName")}</span>
      <input
        className="p-1 border rounded border-base-content border-solid"
        type="text"
        defaultValue={editLabelData.name}
        autoFocus
        onChange={(e) => setNewLabelName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSave();
          }
        }}
      />
      <div className="mt-4 flex justify-end">
        <button className="py-1.5 px-2" type="button" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          className="py-1.5 px-2 ml-4 rounded-md bg-gray-100 text-black hover:bg-gray-300"
          type="button"
          onClick={() => {
            handleSave();
          }}
        >
          {t("common.save")}
        </button>
      </div>
    </GenericModal>
  );
};

export const LayerPicker = ({
  layers,
  selectedLayerIndex,
  canAdd,
  canRemove,
  onLayerClicked,
  onLayerMoved,
  onAddClicked,
  onRemoveClicked,
  onLayerNameChanged,
  ...props
}: LayerPickerProps) => {
  const t = useT();
  const [editLabelData, setEditLabelData] = useState<EditLabelData | null>(
    null
  );

  const layer_items = useMemo(() => {
    return layers.map((l, i) => ({
      name: l.name || i.toLocaleString(),
      id: l.id,
      index: i,
      selected: i === selectedLayerIndex,
    }));
  }, [layers, selectedLayerIndex]);

  const selectionChanged = useCallback(
    (s: Selection) => {
      if (s === "all") {
        return;
      }

      onLayerClicked?.(layer_items.findIndex((l) => s.has(l.id)));
    },
    [onLayerClicked, layer_items]
  );

  let { dragAndDropHooks } = useDragAndDrop({
    renderDropIndicator(target) {
      return (
        <DropIndicator
          target={target}
          className={"data-[drop-target]:outline outline-1 outline-accent"}
        />
      );
    },
    getItems: (keys) =>
      [...keys].map((key) => ({ "text/plain": key.toLocaleString() })),
    onReorder(e) {
      let startIndex = layer_items.findIndex((l) => e.keys.has(l.id));
      let endIndex = layer_items.findIndex((l) => l.id === e.target.key);
      onLayerMoved?.(startIndex, endIndex);
    },
  });

  const handleSaveNewLabel = useCallback(
    (id: number, oldName: string, newName: string | null) => {
      if (newName !== null) {
        onLayerNameChanged?.(id, oldName, newName);
      }
    },
    [onLayerNameChanged]
  );

  return (
    <div className="flex flex-col min-w-40 pointer-coarse:min-w-0 pointer-coarse:flex-row pointer-coarse:items-center pointer-coarse:gap-2">
      {/* Label and +/- sit above the list on a desktop and beside it on a touch
          screen, where a row of its own is a row the board does not get. */}
      <div className="grid grid-cols-[1fr_auto_auto] items-center pointer-coarse:flex pointer-coarse:shrink-0">
        <Label className="after:content-[':'] text-sm">
          {t("layer.layers")}
        </Label>
        {onRemoveClicked && (
          <button
            type="button"
            className="hover:text-primary-content hover:bg-primary rounded-sm pointer-coarse:p-3.5"
            disabled={!canRemove}
            onClick={onRemoveClicked}
          >
            <Minus className="size-4" />
          </button>
        )}
        {onAddClicked && (
          <button
            type="button"
            disabled={!canAdd}
            className="hover:text-primary-content ml-1 hover:bg-primary rounded-sm disabled:text-gray-500 disabled:hover:bg-base-300 disabled:cursor-not-allowed pointer-coarse:p-3.5"
            onClick={onAddClicked}
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>
      {editLabelData !== null && (
        <EditLabelModal
          open={editLabelData !== null}
          onClose={() => setEditLabelData(null)}
          editLabelData={editLabelData}
          handleSaveNewLabel={handleSaveNewLabel}
        />
      )}
      <ListBox
        aria-label="Keymap Layer"
        selectionMode="single"
        items={layer_items}
        disallowEmptySelection={true}
        selectedKeys={
          layer_items[selectedLayerIndex]
            ? [layer_items[selectedLayerIndex].id]
            : []
        }
        // Down the side on a desktop; across the top on a touch screen. A phone
        // in portrait has no vertical room to spare here, and the column pushed
        // the lower layers off screen — the list was reachable only by
        // scrolling the whole page away from the board you are editing.
        className="ml-2 items-center justify-center cursor-pointer pointer-coarse:ml-0 pointer-coarse:flex pointer-coarse:flex-wrap pointer-coarse:gap-1"
        onSelectionChange={selectionChanged}
        dragAndDropHooks={dragAndDropHooks}
        {...props}
      >
        {(layer_item) => (
          <ListBoxItem
            textValue={layer_item.name}
            className="p-1 b-1 my-1 group grid grid-cols-[1fr_auto] items-center aria-selected:bg-primary aria-selected:text-primary-content border rounded border-transparent border-solid hover:bg-base-300 pointer-coarse:my-0 pointer-coarse:px-2 pointer-coarse:min-h-11 pointer-coarse:border-base-300 pointer-coarse:text-sm"
          >
            <span>{layer_item.name}</span>
            {/*
              Touch adaptation (PLAN.md stage 4 / risk 10). Two separate defects
              made the rename affordance unusable on a touch screen:

              1. Reachability. It used to be `invisible group-hover:visible`, so
                 it never appeared without a mouse. The hide-until-hover rule is
                 now scoped to `pointer: fine`, leaving desktop untouched while
                 touch devices always show it. The wrapper span — not the SVG,
                 whose box is the drawn glyph — carries the 44px tap target.

              2. Activation. The enclosing react-aria ListBoxItem runs usePress,
                 which suppresses the synthetic click the browser would normally
                 emit after `touchend`; verified with Playwright touch emulation
                 (pointerdown/touchstart/pointerup/touchend all fire, `click`
                 never does). So `onClick` alone is dead on touch, and we also
                 activate from `onPointerUp` for non-mouse pointers. Should a
                 click arrive anyway on some WebView, the duplicate call just
                 re-opens the modal with identical data, which is a no-op.

              This deliberately stays a span rather than a <button>: the parent
              has role="option", which must not contain interactive descendants.
            */}
            <span
              className="mx-1 flex items-center justify-center pointer-coarse:mx-0.5 pointer-coarse:size-9 pointer-fine:invisible pointer-fine:group-hover:visible"
              onClick={() =>
                setEditLabelData({ id: layer_item.id, name: layer_item.name })
              }
              onPointerUp={(e) => {
                if (e.pointerType !== "mouse") {
                  setEditLabelData({
                    id: layer_item.id,
                    name: layer_item.name,
                  });
                }
              }}
            >
              <Pencil className="h-4 w-4" />
            </span>
          </ListBoxItem>
        )}
      </ListBox>
    </div>
  );
};
