import {
  BACKUP_FILTERS,
  KEYMAP_FILTERS,
  type FileFilter,
  type FilesBackend,
  type OpenedFile,
  type SavedFile,
} from "../types";

/**
 * Saving and opening text files in a browser.
 *
 * Preferred path is the File System Access API, which gives a real Save-As
 * dialog and reports the name the user actually chose. Where it is missing —
 * or refuses to run, which it does on an opaque origin and inside some embedded
 * webviews — this falls back to a download link and a hidden file input. The
 * fallback cannot report the final name (the browser may rename to avoid a
 * collision), so it reports the suggested one; nothing downstream depends on
 * the name being exact, only on it being a sensible base for the next name.
 *
 * There is no path anywhere, by design: a page never learns one.
 */

// The File System Access API is not in TypeScript's DOM lib yet.
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
interface OpenFilePickerOptions extends SaveFilePickerOptions {
  multiple?: boolean;
}
interface FileSystemWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
interface FileHandle {
  name: string;
  createWritable(): Promise<FileSystemWritable>;
  getFile(): Promise<File>;
}
declare global {
  interface Window {
    showSaveFilePicker?: (o?: SaveFilePickerOptions) => Promise<FileHandle>;
    showOpenFilePicker?: (o?: OpenFilePickerOptions) => Promise<FileHandle[]>;
  }
}

/** Our filter shape -> the picker's MIME-keyed shape. */
function pickerTypes(filters: FileFilter[]) {
  return filters.map((f) => ({
    description: f.name,
    accept: {
      "text/plain": f.extensions.map((e) => `.${e}`),
    },
  }));
}

/** ".json,.keymap" for the <input accept> fallback. */
function acceptAttr(filters: FileFilter[]): string {
  return filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(",");
}

function isCancel(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

function downloadFallback(name: string, contents: string): SavedFile {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some builds; a task later
  // is safely after the browser has taken its copy.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { name, label: name };
}

function inputFallback(filters: FileFilter[]): Promise<OpenedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = acceptAttr(filters);
    input.style.display = "none";

    // A cancelled picker fires nothing in older browsers, so the element would
    // leak and the promise hang. `cancel` covers modern ones; the window focus
    // check covers the rest.
    const cleanup = () => {
      input.remove();
      window.removeEventListener("focus", onFocus);
    };
    const onFocus = () =>
      setTimeout(() => {
        if (!input.files?.length) {
          cleanup();
          resolve(null);
        }
      }, 500);

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) return resolve(null);
      try {
        resolve({ name: file.name, label: file.name, text: await file.text() });
      } catch (e) {
        reject(e);
      }
    });
    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    });

    document.body.appendChild(input);
    window.addEventListener("focus", onFocus, { once: true });
    input.click();
  });
}

export async function saveTextFile(
  suggestedName: string,
  contents: string,
  filters: FileFilter[],
): Promise<SavedFile | null> {
  if (window.showSaveFilePicker) {
    let handle: FileHandle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName,
        types: pickerTypes(filters),
      });
    } catch (e) {
      if (isCancel(e)) return null;
      // Security errors (opaque origin, no user activation) are worth retrying
      // through the download path rather than failing the whole export.
      return downloadFallback(suggestedName, contents);
    }
    const w = await handle.createWritable();
    await w.write(contents);
    await w.close();
    return { name: handle.name, label: handle.name };
  }
  return downloadFallback(suggestedName, contents);
}

async function openWith(filters: FileFilter[]): Promise<OpenedFile | null> {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: pickerTypes(filters),
      });
      if (!handle) return null;
      const file = await handle.getFile();
      return { name: handle.name, label: handle.name, text: await file.text() };
    } catch (e) {
      if (isCancel(e)) return null;
      return inputFallback(filters);
    }
  }
  return inputFallback(filters);
}

export const openBackupFile = () => openWith(BACKUP_FILTERS);
export const openKeymapFile = () => openWith(KEYMAP_FILTERS);

export const webFiles: FilesBackend = {
  saveTextFile,
  openBackupFile,
  openKeymapFile,
};
