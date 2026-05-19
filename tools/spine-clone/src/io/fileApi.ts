// Unified file API — uses Tauri's native dialog/fs plugins when available
// (running in Tauri WebView), falls back to browser File API for dev in plain
// browsers. Both code paths return the same File[] shape.
//
// Why: HTML <input type="file"> can be unreliable in WebView2 with certain
// security configs. Tauri's native dialog opens the OS file picker via Rust
// backend → reliable across all environments.

declare global {
  interface Window {
    __TAURI_INTERNALS__?: any;
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
}

export interface OpenDialogOptions {
  multiple?: boolean;
  filters?: { name: string; extensions: string[] }[];
  title?: string;
}

/**
 * Open file picker. Returns array of File objects (same shape as <input>).
 * In Tauri: uses native OS dialog → reads file paths → converts to File via fs API.
 * In browser: triggers a hidden <input type="file"> click.
 */
export async function openFilePicker(options: OpenDialogOptions = {}): Promise<File[]> {
  if (isTauri()) {
    return openTauriDialog(options);
  }
  return openBrowserPicker(options);
}

async function openTauriDialog(options: OpenDialogOptions): Promise<File[]> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const { readFile } = await import('@tauri-apps/plugin-fs');

  const result = await open({
    multiple: options.multiple ?? false,
    filters: options.filters,
    title: options.title,
  });
  if (!result) return [];                          // user cancelled
  const paths = Array.isArray(result) ? result : [result];

  const out: File[] = [];
  for (const path of paths) {
    try {
      const bytes = await readFile(path);
      const filename = path.replace(/^.*[\\/]/, '');
      // Construct File with content-type sniffed from extension
      const mime = guessMime(filename);
      const file = new File([bytes], filename, { type: mime });
      // Stash original full path so downstream code can locate sibling files
      (file as any)._tauriPath = path;
      out.push(file);
    } catch (err) {
      console.error('[fileApi] failed to read', path, err);
    }
  }
  return out;
}

function openBrowserPicker(options: OpenDialogOptions): Promise<File[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = options.multiple ?? false;
    if (options.filters && options.filters.length) {
      // Browser accept= attribute is csv of extensions/mime
      input.accept = options.filters
        .flatMap(f => f.extensions.map(ext => '.' + ext))
        .join(',');
    }
    input.style.display = 'none';
    input.onchange = () => {
      resolve(Array.from(input.files ?? []));
      input.remove();
    };
    input.oncancel = () => {
      resolve([]);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'png':  return 'image/png';
    case 'webp': return 'image/webp';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif':  return 'image/gif';
    case 'json': return 'application/json';
    case 'spine-json': return 'application/json';
    case 'atlas': return 'text/plain';
    default: return 'application/octet-stream';
  }
}

/**
 * Save a string to a file. Tauri: native save dialog → writes via fs.
 * Browser: download via blob URL.
 */
export async function saveTextFile(
  content: string,
  defaultFilename: string,
  options: { filters?: { name: string; extensions: string[] }[]; title?: string } = {},
): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({
      defaultPath: defaultFilename,
      filters: options.filters,
      title: options.title,
    });
    if (!path) return false;
    await writeTextFile(path, content);
    return true;
  }
  // Browser fallback: trigger download
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
