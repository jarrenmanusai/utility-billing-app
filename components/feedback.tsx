import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, Text, View } from "react-native";

import { Button, Card } from "@/components/ui/primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

// =================== Confirm Dialog ===================

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: React.ComponentProps<typeof IconSymbol>["name"];
};

type ConfirmCtx = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmCtx | null>(null);

export function useConfirm(): ConfirmCtx {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <FeedbackProvider>");
  return ctx;
}

// =================== Toast ===================

export type ToastVariant = "success" | "error" | "info";
export type ToastOptions = {
  variant?: ToastVariant;
  duration?: number;
};

type ToastCtx = (message: string, opts?: ToastOptions) => void;
const ToastContext = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <FeedbackProvider>");
  return ctx;
}

// =================== Provider ===================

type ConfirmState = ConfirmOptions & { resolve: (v: boolean) => void };
type ToastState = { id: number; message: string; variant: ToastVariant };

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastIdRef = useRef(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  const showConfirm = useCallback<ConfirmCtx>((opts) => {
    return new Promise((resolve) => {
      setConfirm({ ...opts, resolve });
    });
  }, []);

  const showToast = useCallback<ToastCtx>(
    (message, opts) => {
      toastIdRef.current += 1;
      const id = toastIdRef.current;
      const variant = opts?.variant ?? "info";
      setToast({ id, message, variant });
      const duration = opts?.duration ?? 2500;
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      ]).start();

      const t = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 20, duration: 180, useNativeDriver: true }),
        ]).start(({ finished }) => {
          if (finished) {
            setToast((t) => (t?.id === id ? null : t));
          }
        });
      }, duration);
      return () => clearTimeout(t);
    },
    [opacity, translateY],
  );

  // Reset confirm dialog on unmount
  useEffect(() => () => setConfirm(null), []);

  const variantColor = (v: ToastVariant) => {
    if (v === "success") return colors.success;
    if (v === "error") return colors.error;
    return colors.primary;
  };

  const variantIcon = (v: ToastVariant): React.ComponentProps<typeof IconSymbol>["name"] => {
    if (v === "success") return "checkmark.circle.fill";
    if (v === "error") return "exclamationmark.circle.fill";
    return "info.circle.fill";
  };

  return (
    <ConfirmContext.Provider value={showConfirm}>
      <ToastContext.Provider value={showToast}>
        {children}

        {/* Confirmation modal */}
        <Modal
          visible={!!confirm}
          transparent
          animationType="fade"
          onRequestClose={() => {
            confirm?.resolve(false);
            setConfirm(null);
          }}
        >
          <Pressable
            onPress={() => {
              confirm?.resolve(false);
              setConfirm(null);
            }}
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <Card>
                <View className="items-center mb-3">
                  <View
                    className="w-14 h-14 rounded-full items-center justify-center mb-2"
                    style={{
                      backgroundColor: (confirm?.destructive ? colors.error : colors.primary) + "22",
                    }}
                  >
                    <IconSymbol
                      name={confirm?.icon ?? (confirm?.destructive ? "trash.fill" : "questionmark.circle.fill")}
                      size={32}
                      color={confirm?.destructive ? colors.error : colors.primary}
                    />
                  </View>
                  <Text className="text-lg font-bold text-foreground text-center">
                    {confirm?.title}
                  </Text>
                  {confirm?.message ? (
                    <Text className="text-sm text-muted text-center mt-1">{confirm.message}</Text>
                  ) : null}
                </View>
                <View className="flex-row gap-3">
                  <View style={{ flex: 1 }}>
                    <Button
                      title={confirm?.cancelLabel ?? "Cancel"}
                      variant="secondary"
                      onPress={() => {
                        confirm?.resolve(false);
                        setConfirm(null);
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title={confirm?.confirmLabel ?? "Confirm"}
                      variant={confirm?.destructive ? "danger" : "primary"}
                      onPress={() => {
                        confirm?.resolve(true);
                        setConfirm(null);
                      }}
                    />
                  </View>
                </View>
              </Card>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Toast */}
        {toast ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              bottom: 96,
              opacity,
              transform: [{ translateY }],
              alignItems: "center",
            }}
          >
            <View
              className="flex-row items-center gap-2 rounded-2xl px-4 py-3 shadow-lg"
              style={{
                backgroundColor: colors.background,
                borderWidth: 1,
                borderColor: colors.border,
                maxWidth: 480,
              }}
            >
              <IconSymbol name={variantIcon(toast.variant)} size={18} color={variantColor(toast.variant)} />
              <Text className="text-sm font-semibold text-foreground flex-shrink">
                {toast.message}
              </Text>
            </View>
          </Animated.View>
        ) : null}
      </ToastContext.Provider>
    </ConfirmContext.Provider>
  );
}
