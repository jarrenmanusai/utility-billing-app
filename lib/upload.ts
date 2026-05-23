import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

import { getApiBaseUrl } from "@/constants/oauth";
import { getToken } from "@/lib/session";

export type PickerOrigin = "camera" | "library";

/** Prompt the user to pick or capture an image. Returns local URI or null. */
export async function pickImage(origin: PickerOrigin): Promise<string | null> {
  if (origin === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: false,
    });
    if (result.canceled || result.assets.length === 0) return null;
    return result.assets[0].uri;
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: false,
    });
    if (result.canceled || result.assets.length === 0) return null;
    return result.assets[0].uri;
  }
}

/**
 * Upload a local image (file:// URI on native, blob/data URL on web) to the
 * server's storage proxy. Returns a publicly accessible URL.
 *
 * On web we POST a FormData multipart; on native we use the same since
 * fetch() handles native file URIs as multipart parts.
 */
export async function uploadImage(uri: string, folder = "uploads"): Promise<string> {
  const base = getApiBaseUrl();
  const token = await getToken();

  const filename = uri.split("/").pop() || `photo-${Date.now()}.jpg`;
  const type = (() => {
    const m = /\.(\w+)$/.exec(filename);
    const ext = (m?.[1] ?? "jpg").toLowerCase();
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    return "image/jpeg";
  })();

  const formData = new FormData();
  if (Platform.OS === "web") {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    formData.append("file", blob, filename);
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
    throw new Error(`Upload failed (${res.status})`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}
