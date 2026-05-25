import { useEffect, useMemo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { Button, TextField } from "@/components/ui/primitives";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  formatDuePreview,
  formatLongDate,
  parseDueDate,
  suggestDates,
  toIsoDate,
  type DateSuggestion,
} from "@/lib/date-parse";

/**
 * Smart due-date input.
 *
 * Three parallel input modes:
 *   1. Tap the calendar icon to open the native date picker (or HTML5 picker on web).
 *   2. Type freely (MM/DD, May 30, ISO etc.) — parsed live with preview.
 *   3. Tap an autofill suggestion chip when input is vague (e.g. "May", "30").
 *
 * All user-visible dates render in "May 23, 2026" format (long month + day + 4-digit year).
 * Stores the value as YYYY-MM-DD via `onChange` for API transmission.
 */
export interface DueDatePickerProps {
  value: string; // ISO YYYY-MM-DD or ""
  onChange: (iso: string) => void;
  label?: string;
}

export function DueDatePicker({
  value,
  onChange,
  label = "Due date (optional)",
}: DueDatePickerProps) {
  const colors = useColors();
  // The text the user has typed. Once they pick / commit a date, we replace
  // this with the long-form "May 30, 2026" string so the input never shows
  // ISO digits back to them.
  const [text, setText] = useState<string>(() => {
    if (!value) return "";
    const parsed = parseDueDate(value);
    return parsed ? formatLongDate(parsed.date) : value;
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  // Keep local text in sync if the parent value changes externally (e.g. reset).
  useEffect(() => {
    if (!value) {
      if (text !== "") setText("");
      return;
    }
    const parsed = parseDueDate(value);
    if (parsed) {
      const pretty = formatLongDate(parsed.date);
      if (pretty !== text) setText(pretty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const parsed = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    return parseDueDate(trimmed);
  }, [text]);

  const suggestions: DateSuggestion[] = useMemo(() => {
    if (parsed) return []; // already valid, no need to suggest
    return suggestDates(text);
  }, [text, parsed]);

  const handleTextChange = (next: string) => {
    setText(next);
    if (!next.trim()) {
      onChange("");
      return;
    }
    const r = parseDueDate(next.trim());
    if (r) onChange(toIsoDate(r.date));
  };

  const applySuggestion = (s: DateSuggestion) => {
    setText(formatLongDate(s.date));
    onChange(s.iso);
  };

  const handlePickerChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS !== "ios") setPickerOpen(false);
    if (selectedDate) {
      setText(formatLongDate(selectedDate));
      onChange(toIsoDate(selectedDate));
    }
  };

  // Web change handler for the overlapping hidden HTML5 date input.
  const handleWebInputChange = (e: { target: { value: string } }) => {
    const v = e.target.value;
    if (!v) return;
    const [y, m, d] = v.split("-").map((s) => parseInt(s, 10));
    if (!y || !m || !d) return;
    const date = new Date(y, m - 1, d);
    setText(formatLongDate(date));
    onChange(toIsoDate(date));
  };

  const initialPickerDate = parsed?.date ?? new Date();
  const showSuggestions = focused && suggestions.length > 0;

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <TextField
            label={label}
            value={text}
            onChangeText={handleTextChange}
            placeholder="e.g. May 30 or 05/30"
            autoCapitalize="none"
            onFocus={() => setFocused(true)}
            onBlur={() => {
              // Delay so suggestion-chip taps register before blur hides them
              setTimeout(() => setFocused(false), 150);
            }}
          />
        </View>

        {/* Calendar button — opens native picker on iOS/Android, HTML5 picker on web.
            On web, the entire 48x48 area is the HTML5 date input itself (transparent),
            with the icon rendered behind it via pointer-events:none so the input always
            receives clicks across the full button surface. */}
        <View
          style={{
            width: 48,
            height: 48,
            marginBottom: 2,
            position: "relative",
          }}
        >
          {/* Visual layer: the bordered box with the calendar icon — non-interactive */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconSymbol name="calendar" size={22} color={colors.tint} />
          </View>

          {/* Interaction layer: covers the entire 48x48 area */}
          {Platform.OS === "web" ? (
            // A REAL HTML5 date input stretched to fill the button.
            // Transparent but on-screen and pointer-event-eligible so clicking ANYWHERE
            // in the 48x48 button (including padding) opens the date picker.
            (require("react").createElement("input", {
              type: "date",
              value: parsed ? toIsoDate(parsed.date) : "",
              onChange: handleWebInputChange,
              "aria-label": "Open calendar picker",
              title: "Open calendar picker",
              style: {
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                opacity: 0,
                cursor: "pointer",
                border: "none",
                padding: 0,
                margin: 0,
                background: "transparent",
                color: "transparent",
                zIndex: 2,
              },
            }) as unknown as React.ReactElement)
          ) : (
            <Pressable
              onPress={() => setPickerOpen(true)}
              accessibilityLabel="Open calendar picker"
              style={({ pressed }) => [
                {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 12,
                },
                pressed && { opacity: 0.6 },
              ]}
            />
          )}
        </View>
      </View>

      {/* Autofill suggestion chips */}
      {showSuggestions ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 6, fontWeight: "600" }}>
            Did you mean…
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={{ gap: 8, paddingRight: 8 }}
          >
            {suggestions.map((s) => (
              <Pressable
                key={s.iso}
                onPress={() => applySuggestion(s)}
                style={({ pressed }) => [
                  {
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.tint,
                    backgroundColor: pressed ? colors.tint + "22" : colors.tint + "10",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  },
                ]}
              >
                <IconSymbol name="calendar" size={12} color={colors.tint} />
                <Text style={{ color: colors.tint, fontSize: 12, fontWeight: "600" }}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Live preview / error */}
      {text.trim() ? (
        parsed ? (
          <View
            style={{
              marginTop: 6,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 10,
              backgroundColor: colors.tint + "14",
              alignSelf: "flex-start",
            }}
          >
            <IconSymbol name="checkmark.circle.fill" size={14} color={colors.tint} />
            <Text style={{ color: colors.tint, fontSize: 12, fontWeight: "600" }}>
              Due {formatDuePreview(parsed.date)}
              {parsed.yearWasInferred ? " · year assumed" : ""}
            </Text>
          </View>
        ) : suggestions.length === 0 ? (
          <Text style={{ marginTop: 6, color: colors.error, fontSize: 12 }}>
            Couldn&apos;t read that date. Try &quot;May 30&quot; or &quot;05/30&quot;.
          </Text>
        ) : null
      ) : null}

      {/* Native date picker modal (iOS / Android only — web uses HTML5 input above) */}
      {pickerOpen && Platform.OS !== "web" ? (
        Platform.OS === "ios" ? (
          <Modal transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
              onPress={() => setPickerOpen(false)}
            >
              <Pressable onPress={(e) => e.stopPropagation()}>
                <View style={{ backgroundColor: colors.background, padding: 16 }}>
                  <DateTimePicker
                    mode="date"
                    display="spinner"
                    value={initialPickerDate}
                    onChange={handlePickerChange}
                  />
                  <Button title="Done" onPress={() => setPickerOpen(false)} />
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        ) : (
          <DateTimePicker mode="date" value={initialPickerDate} onChange={handlePickerChange} />
        )
      ) : null}
    </View>
  );
}
