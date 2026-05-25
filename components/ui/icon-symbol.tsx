// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<string, ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "person.fill": "person",
  "person.2.fill": "people",
  "bolt.fill": "bolt",
  "doc.text.fill": "description",
  "bell.fill": "notifications",
  "bubble.left.and.bubble.right.fill": "chat",
  "gearshape.fill": "settings",
  "camera.fill": "camera-alt",
  "photo.fill": "photo",
  "plus": "add",
  "trash.fill": "delete",
  "pencil": "edit",
  "checkmark": "check",
  "checkmark.circle.fill": "check-circle",
  "xmark": "close",
  "xmark.circle.fill": "cancel",
  "arrow.right": "arrow-forward",
  "arrow.left": "arrow-back",
  "arrow.up.circle.fill": "arrow-circle-up",
  "arrow.down.circle.fill": "arrow-circle-down",
  "arrow.clockwise": "refresh",
  "square.and.arrow.up": "file-upload",
  "square.and.arrow.down": "file-download",
  "creditcard.fill": "payment",
  "chart.bar.fill": "bar-chart",
  "shield.fill": "security",
  "shield.lefthalf.filled": "admin-panel-settings",
  "lock.fill": "lock",
  "key.fill": "vpn-key",
  "envelope.fill": "email",
  "moon.fill": "dark-mode",
  "sun.max.fill": "light-mode",
  "power": "power-settings-new",
  "eye.fill": "visibility",
  "eye.slash.fill": "visibility-off",
  "sparkles": "auto-awesome",
  "exclamationmark.triangle.fill": "warning",
  "exclamationmark.circle.fill": "error",
  "info.circle.fill": "info",
  "info.circle": "info-outline",
  "questionmark.circle.fill": "help",
  "calendar": "calendar-today",
  "clock.fill": "schedule",
  "magnifyingglass": "search",
  "line.3.horizontal": "menu",
  "ellipsis": "more-horiz",
  "banknote": "account-balance-wallet",
  "arrow.up.tray": "upload-file",
  "square.grid.2x2.fill": "grid-view",
  "rectangle.stack.fill": "layers",
  "hammer.fill": "build",
  "paperclip": "attach-file",
  "arrow.down.app.fill": "download",
  "arrow.up.app.fill": "upload",
  "hourglass": "hourglass-empty",
  "lock.open.fill": "lock-open",
  "arrow.uturn.backward": "undo",
  "link": "link",
  "drop.fill": "water-drop",
  "wifi": "wifi",
  "flame.fill": "local-fire-department",
  "trash": "delete-outline",
  "tv.fill": "tv",
  "phone.fill": "phone",
  "car.fill": "directions-car",
  "house.lodge.fill": "cottage",
  "leaf.fill": "eco",
  "face.smiling": "sentiment-satisfied",
  "hand.thumbsup.fill": "thumb-up",
  "star.fill": "star",
} satisfies IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
