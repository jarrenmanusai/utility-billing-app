import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";

import { getApiBaseUrl } from "@/constants/oauth";
import { getToken } from "@/lib/session";

export type PickerOrigin = "camera" | "library";

/**
 * Prompt the user to pick or capture an image. Returns local URI or null.
 *
 * Reliability fixes (Round 18):
 *  • Library on iOS/Android: per Expo SDK 54 docs, no explicit media-library
 *    permission request is needed for `launchImageLibraryAsync` — calling
 *    `requestMediaLibraryPermissionsAsync()` first sometimes returns
 *    `granted: false` on iOS 14+ "limited photos" mode and silently aborts
 *    the picker. We now skip that pre-check on native and just open the
 *    picker; the system shows its own permission UI.
 *  • Camera on iOS/Android: still requires explicit permission; we surface
 *    a friendly Alert when the user denies it instead of failing silently.
 *  • Web: `launchImageLibraryAsync` doesn't open the OS file picker on web
 *    in Expo SDK 54. We use a hidden `<input type="file">` trick instead so
 *    the browser shows its native picker and we get a `data:` URL back.
 */
export async function pickImage(origin: PickerOrigin): Promise<string | null> {
  // -------- Web: use a hidden file input --------
  if (Platform.OS === "web" && origin === "library") {
    return pickImageWeb();
  }

  // -------- Native camera --------
  if (origin === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Camera permission needed",
        "Please allow camera access in your device settings to take photos.",
      );
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: false,
    });
    if (result.canceled || result.assets.length === 0) return null;
    return result.assets[0].uri;
  }

  // -------- Native library --------
  // Note: do NOT pre-request media-library permission on iOS — the picker
  // works without it and the request can falsely deny "limited photos" users.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    base64: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}

/**
 * Web fallback: dynamically create a hidden <input type="file"> and trigger
 * its click() inside the user gesture. Returns a data URL that we can later
 * fetch() to get a Blob for upload. The element is removed once we resolve.
 */
function pickImageWeb(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    // Position it offscreen but still in DOM so the click() user gesture is honored.
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
          resolve(typeof reader.result === "string" ? reader.result : null);
        };
        reader.onerror = () => {
          cleanup();
          resolve(null);
        };
        reader.readAsDataURL(file);
      },
      { once: true },
    );

    // If the user closes the picker without choosing, focus returns to the
    // window. Use that as a fallback "canceled" signal so we don't leave the
    // promise hanging forever. A small timeout lets the change event fire first.
    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(null);
      }, 500);
    };
    window.addEventListener("focus", onFocus);

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Upload a local image (file:// URI on native, blob/data URL on web) to the
 * server's storage proxy. Returns a publicly accessible URL.
 */
export async function uploadImage(uri: string, folder = "uploads"): Promise<string> {
  const base = getApiBaseUrl();
  const token = await getToken();

  const filename = uri.split("/").pop()?.split("?")[0] || `photo-${Date.now()}.jpg`;
  const type = (() => {
    const m = /\.(\w+)$/.exec(filename);
    const ext = (m?.[1] ?? "jpg").toLowerCase();
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "gif") return "image/gif";
    return "image/jpeg";
  })();

  const formData = new FormData();
  if (Platform.OS === "web") {
    // Web URIs may be `data:` (from our hidden input) or `blob:` (from picker).
    // Both are fetchable into a Blob.
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const safeName = filename.includes(".") ? filename : `photo-${Date.now()}.jpg`;
    formData.append("file", blob, safeName);
  } else {
    formData.append("file", {
      uri,
      name: filename,
      type,
    } as any);
  }
  formData.append("folder", folder);

  const res = await fetch(`${base}/api/upload`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status})${text ? `: ${text.slice(0, 120)}` : ""}`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}
