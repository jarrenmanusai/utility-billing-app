import { Platform, Pressable, Text, TextInput, View, type TextInputProps, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";

// ---------- Button ----------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof IconSymbol>["name"];
  className?: string;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  className,
}: ButtonProps) {
  const colors = useColors();
  const isDisabled = disabled || loading;

  const variantStyles: Record<ButtonVariant, string> = {
    primary: "bg-primary",
    secondary: "bg-surface border border-border",
    ghost: "bg-transparent",
    danger: "bg-error",
  };

  const textColor: Record<ButtonVariant, string> = {
    primary: "text-white",
    secondary: "text-foreground",
    ghost: "text-primary",
    danger: "text-white",
  };

  return (
    <Pressable
      onPress={() => {
        if (isDisabled) return;
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        pressed && !isDisabled && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        isDisabled && { opacity: 0.55 },
      ]}
    >
      <View
        className={cn(
          "flex-row items-center justify-center rounded-xl px-5 h-12 gap-2",
          variantStyles[variant],
          className,
        )}
      >
        {loading ? (
          <ActivityIndicator color={variant === "primary" || variant === "danger" ? "#fff" : colors.tint} />
        ) : (
          <>
            {icon && (
              <IconSymbol
                name={icon}
                size={18}
                color={variant === "primary" || variant === "danger" ? "#fff" : colors.tint}
              />
            )}
            <Text className={cn("font-semibold text-base", textColor[variant])}>{title}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

// ---------- TextField ----------

interface TextFieldProps extends Omit<TextInputProps, "className"> {
  label?: string;
  hint?: string;
  error?: string;
  rightIcon?: React.ComponentProps<typeof IconSymbol>["name"];
  onRightIconPress?: () => void;
  containerClassName?: string;
}

export function TextField({
  label,
  hint,
  error,
  rightIcon,
  onRightIconPress,
  containerClassName,
  ...props
}: TextFieldProps) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View className={cn("gap-1.5", containerClassName)}>
      {label ? <Text className="text-sm font-medium text-foreground">{label}</Text> : null}
      <View
        className={cn(
          "flex-row items-center bg-surface rounded-xl border px-4 h-12",
          error ? "border-error" : focused ? "border-primary" : "border-border",
        )}
      >
        <TextInput
          placeholderTextColor={colors.muted}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 }, props.style as any]}
        />
        {rightIcon ? (
          <Pressable onPress={onRightIconPress} hitSlop={8}>
            <IconSymbol name={rightIcon} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="text-xs text-error">{error}</Text> : hint ? <Text className="text-xs text-muted">{hint}</Text> : null}
    </View>
  );
}

// ---------- Card ----------

export function Card({
  children,
  className,
  onPress,
}: {
  children: React.ReactNode;
  className?: string;
  onPress?: () => void;
}) {
  const inner = (
    <View className={cn("bg-surface rounded-2xl border border-border p-4", className)}>
      {children}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
    >
      {inner}
    </Pressable>
  );
}

// ---------- EmptyState ----------

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ComponentProps<typeof IconSymbol>["name"];
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View className="flex-1 items-center justify-center py-12 px-6">
      {icon ? (
        <View className="w-16 h-16 rounded-full bg-surface items-center justify-center mb-4">
          <IconSymbol name={icon} size={28} color={colors.muted} />
        </View>
      ) : null}
      <Text className="text-lg font-semibold text-foreground text-center">{title}</Text>
      {body ? <Text className="text-sm text-muted text-center mt-1">{body}</Text> : null}
      {action ? <View className="mt-4">{action}</View> : null}
    </View>
  );
}

// ---------- Header with optional back button ----------

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
      <View className="flex-row items-center gap-2 flex-1">
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
            <IconSymbol name="chevron.left" size={26} color={colors.text} />
          </Pressable>
        ) : null}
        <View className="flex-1">
          <Text className="text-lg font-bold text-foreground" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-xs text-muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {right}
    </View>
  );
}

// ---------- Status badge ----------

export function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    draft: "bg-muted/20 text-muted",
    deployed: "bg-warning/20 text-warning",
    paid: "bg-success/20 text-success",
    pending: "bg-warning/20 text-warning",
    active: "bg-success/20 text-success",
    frozen: "bg-error/20 text-error",
    deleted: "bg-muted/20 text-muted",
  };
  const cls = colorMap[status] ?? "bg-muted/20 text-muted";
  return (
    <View className={cn("px-2 py-0.5 rounded-full", cls.split(" ")[0])}>
      <Text className={cn("text-xs font-semibold capitalize", cls.split(" ")[1])}>
        {status}
      </Text>
    </View>
  );
}

// ---------- Dropdown ----------

import { Modal, ScrollView } from "react-native";

export interface DropdownOption {
  value: string | number;
  label: string;
  sublabel?: string;
}

interface DropdownProps {
  label?: string;
  placeholder?: string;
  value: string | number | null | undefined;
  options: DropdownOption[];
  onChange: (value: string | number) => void;
  disabled?: boolean;
  emptyText?: string;
  emptyAction?: { label: string; onPress: () => void };
  containerClassName?: string;
}

export function Dropdown({
  label,
  placeholder = "Select…",
  value,
  options,
  onChange,
  disabled,
  emptyText,
  emptyAction,
  containerClassName,
}: DropdownProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View className={cn("gap-1.5", containerClassName)}>
      {label ? <Text className="text-sm font-medium text-foreground">{label}</Text> : null}
      <Pressable
        onPress={() => {
          if (disabled) return;
          if (options.length === 0 && emptyAction) {
            emptyAction.onPress();
            return;
          }
          setOpen(true);
        }}
        disabled={disabled}
        style={({ pressed }) => [pressed && !disabled && { opacity: 0.7 }, disabled && { opacity: 0.55 }]}
      >
        <View className="flex-row items-center bg-surface rounded-xl border border-border px-4 h-12">
          <Text className={cn("flex-1 text-base", selected ? "text-foreground" : "text-muted")} numberOfLines={1}>
            {selected ? selected.label : placeholder}
          </Text>
          <IconSymbol name="chevron.right" size={18} color={colors.muted} style={{ transform: [{ rotate: "90deg" }] }} />
        </View>
      </Pressable>

      {options.length === 0 && emptyText ? (
        <View className="flex-row items-center justify-between mt-1">
          <Text className="text-xs text-muted flex-1">{emptyText}</Text>
          {emptyAction ? (
            <Pressable onPress={emptyAction.onPress} hitSlop={8} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
              <Text className="text-xs font-semibold text-primary">{emptyAction.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: colors.surface, borderRadius: 16, maxHeight: "70%" }}>
            <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">{label ?? "Select"}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <IconSymbol name="xmark" size={18} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 8 }}>
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <Pressable
                    key={String(opt.value)}
                    onPress={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                    className={cn(
                      "flex-row items-center rounded-xl px-3 py-3 mb-1 gap-3",
                      isSelected ? "bg-primary/10" : "bg-transparent",
                    )}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        className={cn("text-base font-semibold", isSelected ? "text-primary" : "text-foreground")}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                      {opt.sublabel ? (
                        <Text className="text-xs text-muted mt-0.5" numberOfLines={1}>
                          {opt.sublabel}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ width: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {isSelected ? (
                        <IconSymbol name="checkmark.circle.fill" size={22} color={colors.tint} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
