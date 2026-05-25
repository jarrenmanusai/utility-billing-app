import { Platform } from "react-native";

import { getApiBaseUrl } from "@/constants/oauth";
import { getToken } from "@/lib/session";

/**
 * Generic file picker used by the admin App Updates panel to select an APK
 * before deploying. Returns metadata + a fetchable URI (data: on web,
 * file:// on native) so the caller can hand it straight to `uploadFile()`.
 *
 * On native we dynamically require `expo-document-picker` so this module
 * stays optional for the existing image flows. On web we use a plain hidden
 * `<input type="file">` so we don't need extra dependencies.
 */
export type PickedFile = {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
};

export async function pickFile(accept = "*/*"): Promise<PickedFile | null> {
  if (Platform.OS === "web") return pickFileWeb(accept);

  // On native, lazily import to avoid loading the package on web.
  let mod: typeof import("expo-document-picker");
  try {
    mod = await import("expo-document-picker");
  } catch {
    // Fallback: if expo-document-picker isn't installed, instruct the caller.
    throw new Error("expo-document-picker is required to pick files on native.");
  }
  const res = await mod.getDocumentAsync({
    type: accept === "*/*" ? "*/*" : accept,
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return {
    uri: a.uri,
    name: a.name ?? `file-${Date.now()}`,
    size: a.size,
    mimeType: a.mimeType,
  };
}

function pickFileWeb(accept: string): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.position = "fixed";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    input.style.left = "-9999px";

    let settled = false;
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.addEventListener(
      "change",
      () => {
        if (settled) return;
        settled = true;
        const file = input.files?.[0];
        if (!file) {
          cleanup();
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          cleanup();
          resolve(
            typeof reader.result === "string"
              ? {
                  uri: reader.result,
                  name: file.name,
                  size: file.size,
                  mimeType: file.type || "application/octet-stream",
                }
              : null,
          );
        };
        reader.onerror = () => {
          cleanup();
          resolve(null);
        };
        reader.readAsDataURL(file);
      },
      { once: true },
    );

    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(null);
      }, 800);
    };
    window.addEventListener("focus", onFocus);

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Upload a previously-picked file via the same multipart endpoint used for
 * image uploads. Returns the publicly-accessible URL stored by the server.
 *
 * On native, FormData accepts the `{ uri, name, type }` shape and React
 * Native's fetch will read the local file contents. On web we fetch the
 * data: URL into a Blob first so the browser uploads bytes instead of a
 * giant string.
 */
export async function uploadFile(
  file: PickedFile,
  folder = "uploads",
): Promise<string> {
  const base = getApiBaseUrl();
  const token = await getToken();

  const fd = new FormData();
  if (Platform.OS === "web") {
    const resp = await fetch(file.uri);
    const blob = await resp.blob();
    fd.append("file", blob, file.name);
  } else {
    fd.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || "application/octet-stream",
    } as any);
  }
  fd.append("folder", folder);

  const res = await fetch(`${base}/api/upload`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status})${text ? `: ${text.slice(0, 160)}` : ""}`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}
