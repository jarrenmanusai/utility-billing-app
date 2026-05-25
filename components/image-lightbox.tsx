import { useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  View,
} from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";

/**
 * Reusable full-screen image preview ("lightbox").
 *
 * Used by chat (sent/received photos) and the bill receipt (meter photo,
 * payment proofs) so any tappable image expands consistently.
 *
 * Behavior:
 *  - Tap the dim backdrop or the close button to dismiss.
 *  - Android hardware back also dismisses (handled via Modal.onRequestClose).
 *  - Uses `Image.getSize` to compute a fit-to-screen rect that preserves the
 *    image's natural aspect ratio with `resizeMode="contain"`. This guarantees
 *    nothing is cropped regardless of orientation.
 *  - Falls back to a square placeholder rect when getSize fails (e.g. invalid
 *    URL) so the close button is still reachable.
 *
 * Pair this component with `useImagePreview()` for ergonomic call sites:
 *
 *     const preview = useImagePreview();
 *     ...
 *     <Pressable onPress={() => preview.open(url)}>
 *       <Image ... />
 *     </Pressable>
 *     <ImageLightbox {...preview.props} />
 */
export interface ImageLightboxProps {
  url: string | null;
  onClose: () => void;
}

export function ImageLightbox({ url, onClose }: ImageLightboxProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!url) {
      setSize(null);
      return;
    }
    let cancelled = false;
    Image.getSize(
      url,
      (w, h) => {
        if (!cancelled) setSize({ w, h });
      },
      () => {
        // Network or CORS error — fall back to a square placeholder so the
        // close button remains visible and the user isn't stranded.
        if (!cancelled) setSize({ w: 1, h: 1 });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  const win = Dimensions.get("window");
  const maxW = win.width;
  // Reserve space at top + bottom so the close button isn't flush against
  // the status bar / home indicator.
  const maxH = win.height - 80;

  let displayW = maxW;
  let displayH = maxH;
  if (size && size.w > 0 && size.h > 0) {
    const ratio = size.w / size.h;
    if (maxW / maxH > ratio) {
      // Window wider than image's aspect → height-bound.
      displayH = maxH;
      displayW = maxH * ratio;
    } else {
      displayW = maxW;
      displayH = maxW / ratio;
    }
  }

  return (
    <Modal
      visible={!!url}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {Platform.OS === "android" ? (
        <RNStatusBar backgroundColor="rgba(0,0,0,0.95)" barStyle="light-content" />
      ) : null}
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.95)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {url ? (
          <Image
            source={{ uri: url }}
            style={{ width: displayW, height: displayH }}
            resizeMode="contain"
          />
        ) : null}
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="Close preview"
          style={({ pressed }) => [
            {
              position: "absolute",
              top: Platform.OS === "ios" ? 56 : 24,
              right: 16,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "rgba(255,255,255,0.18)",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <IconSymbol name="xmark" size={18} color="#ffffff" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Small overlay glyph (a pinch-out icon in a translucent disc) shown in the
 * bottom-right corner of a thumbnail to communicate "tap to expand".
 *
 *     <Pressable>
 *       <Image ... />
 *       <ExpandHint />
 *     </Pressable>
 */
export function ExpandHint() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        right: 8,
        bottom: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: "rgba(0,0,0,0.45)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <IconSymbol name="arrow.up.left.and.arrow.down.right" size={14} color="#ffffff" />
    </View>
  );
}

/**
 * Tiny hook that returns the open()/close() handlers and the props to spread
 * onto <ImageLightbox/>. Keeps call sites concise and avoids repeating the
 * useState boilerplate.
 */
export function useImagePreview() {
  const [url, setUrl] = useState<string | null>(null);
  return {
    open: (u: string) => setUrl(u),
    close: () => setUrl(null),
    props: { url, onClose: () => setUrl(null) } as ImageLightboxProps,
  };
}
