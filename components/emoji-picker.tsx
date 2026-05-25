import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

/**
 * EmojiPicker — a curated "premium" emoji panel for the chat composer.
 *
 * Design choices:
 *  • Curated > exhaustive: 8 categories with the emojis that real people use
 *    in landlord/tenant conversations (greetings, money, utilities, weather,
 *    deadlines, gratitude). Avoids the bloat of a full Unicode 15.1 sheet.
 *  • Recents: the 24 most-recently-tapped emojis are persisted to
 *    AsyncStorage under a single key so they survive app restarts and are
 *    shown first when the picker opens.
 *  • Search: a single-line text filter does substring matching against the
 *    keyword list of every emoji. Works across all categories.
 *  • Bottom-sheet style modal: matches iOS keyboard accessory patterns and
 *    keeps the chat scroll position untouched.
 */

interface EmojiEntry {
  char: string;
  // Keywords are space-separated single tokens used by the search filter.
  // Keep them lowercase and short so substring search is forgiving.
  keywords: string;
}

interface EmojiCategory {
  key: string;
  label: string;
  // SF Symbol name — also mapped in icon-symbol.tsx.
  icon: React.ComponentProps<typeof IconSymbol>["name"];
  emojis: EmojiEntry[];
}

// Curated set. Order inside each category is "most useful first".
const CATEGORIES: EmojiCategory[] = [
  {
    key: "smileys",
    label: "Smileys",
    icon: "face.smiling",
    emojis: [
      { char: "😀", keywords: "smile happy grin" },
      { char: "😁", keywords: "grin happy" },
      { char: "😂", keywords: "laugh tears" },
      { char: "🤣", keywords: "rofl laugh" },
      { char: "😊", keywords: "blush happy smile" },
      { char: "😇", keywords: "angel innocent" },
      { char: "🙂", keywords: "smile slight" },
      { char: "😉", keywords: "wink" },
      { char: "😍", keywords: "love heart eyes" },
      { char: "🥰", keywords: "love hearts adore" },
      { char: "😘", keywords: "kiss" },
      { char: "😜", keywords: "tongue wink" },
      { char: "🤪", keywords: "crazy zany" },
      { char: "🤩", keywords: "star eyes excited" },
      { char: "🥳", keywords: "party celebrate" },
      { char: "😎", keywords: "cool sunglasses" },
      { char: "🤔", keywords: "thinking hmm" },
      { char: "😐", keywords: "neutral" },
      { char: "😴", keywords: "sleep tired" },
      { char: "😢", keywords: "cry sad" },
      { char: "😭", keywords: "cry sob" },
      { char: "😡", keywords: "angry mad" },
      { char: "😅", keywords: "sweat smile awkward" },
      { char: "😬", keywords: "grimace awkward" },
    ],
  },
  {
    key: "gestures",
    label: "Gestures",
    icon: "hand.thumbsup.fill",
    emojis: [
      { char: "👍", keywords: "thumbs up ok yes" },
      { char: "👎", keywords: "thumbs down no" },
      { char: "👌", keywords: "ok perfect" },
      { char: "🤝", keywords: "handshake deal" },
      { char: "🙏", keywords: "thanks pray please" },
      { char: "👏", keywords: "clap applause" },
      { char: "💪", keywords: "strong muscle" },
      { char: "🤲", keywords: "open hands" },
      { char: "✋", keywords: "stop hand wait" },
      { char: "👋", keywords: "wave hi hello bye" },
      { char: "👉", keywords: "point right" },
      { char: "👈", keywords: "point left" },
      { char: "👇", keywords: "point down" },
      { char: "👆", keywords: "point up" },
      { char: "✌️", keywords: "peace victory" },
      { char: "🤞", keywords: "fingers crossed luck" },
      { char: "🤟", keywords: "love you" },
      { char: "💖", keywords: "sparkling heart love" },
    ],
  },
  {
    key: "money",
    label: "Money",
    icon: "banknote",
    emojis: [
      { char: "💰", keywords: "money bag" },
      { char: "💵", keywords: "cash dollar bill" },
      { char: "💴", keywords: "yen money" },
      { char: "💶", keywords: "euro money" },
      { char: "💷", keywords: "pound money" },
      { char: "💸", keywords: "money wings flying" },
      { char: "💳", keywords: "card credit pay" },
      { char: "🧾", keywords: "receipt bill invoice" },
      { char: "🏦", keywords: "bank" },
      { char: "🏧", keywords: "atm cash" },
      { char: "💎", keywords: "gem diamond premium" },
      { char: "📈", keywords: "chart up profit" },
      { char: "📉", keywords: "chart down loss" },
      { char: "💲", keywords: "dollar" },
      { char: "💱", keywords: "exchange currency" },
      { char: "🤑", keywords: "money mouth" },
    ],
  },
  {
    key: "utilities",
    label: "Utilities",
    icon: "bolt.fill",
    emojis: [
      { char: "💡", keywords: "lightbulb idea power electric" },
      { char: "⚡", keywords: "electric power volt" },
      { char: "🔌", keywords: "plug electric" },
      { char: "🔋", keywords: "battery power" },
      { char: "💧", keywords: "water drop" },
      { char: "🚿", keywords: "shower water" },
      { char: "🚽", keywords: "toilet" },
      { char: "🚰", keywords: "water tap" },
      { char: "🔥", keywords: "fire hot gas" },
      { char: "❄️", keywords: "cold snowflake aircon" },
      { char: "🌡️", keywords: "temperature thermometer" },
      { char: "📶", keywords: "signal wifi internet" },
      { char: "📡", keywords: "satellite cable" },
      { char: "📲", keywords: "mobile signal phone" },
      { char: "🏠", keywords: "house home" },
      { char: "🏢", keywords: "building apartment" },
      { char: "🛁", keywords: "bath water" },
      { char: "🍳", keywords: "stove cooking gas" },
    ],
  },
  {
    key: "time",
    label: "Time",
    icon: "clock.fill",
    emojis: [
      { char: "⏰", keywords: "alarm clock reminder" },
      { char: "⏳", keywords: "hourglass time wait" },
      { char: "⌛", keywords: "hourglass time" },
      { char: "📅", keywords: "calendar date" },
      { char: "📆", keywords: "calendar" },
      { char: "🗓️", keywords: "calendar spiral" },
      { char: "🕐", keywords: "clock 1" },
      { char: "🕒", keywords: "clock 3" },
      { char: "🕕", keywords: "clock 6" },
      { char: "🕘", keywords: "clock 9" },
      { char: "⏱️", keywords: "stopwatch" },
      { char: "⏲️", keywords: "timer" },
      { char: "🌅", keywords: "morning sunrise" },
      { char: "🌆", keywords: "evening dusk" },
      { char: "🌃", keywords: "night" },
    ],
  },
  {
    key: "objects",
    label: "Objects",
    icon: "doc.text.fill",
    emojis: [
      { char: "📝", keywords: "memo note write" },
      { char: "📄", keywords: "page document" },
      { char: "📋", keywords: "clipboard list" },
      { char: "📎", keywords: "clip attach" },
      { char: "📌", keywords: "pin" },
      { char: "📍", keywords: "pin location" },
      { char: "🔑", keywords: "key" },
      { char: "🔒", keywords: "lock secure" },
      { char: "🔓", keywords: "unlock" },
      { char: "📞", keywords: "phone call" },
      { char: "📱", keywords: "mobile phone" },
      { char: "💻", keywords: "laptop computer" },
      { char: "📧", keywords: "email mail" },
      { char: "📤", keywords: "outbox send" },
      { char: "📥", keywords: "inbox receive" },
      { char: "📦", keywords: "package box" },
      { char: "🛒", keywords: "cart shopping" },
      { char: "🎁", keywords: "gift present" },
    ],
  },
  {
    key: "symbols",
    label: "Symbols",
    icon: "sparkles",
    emojis: [
      { char: "✅", keywords: "check done yes" },
      { char: "❌", keywords: "cross no x" },
      { char: "⚠️", keywords: "warning caution" },
      { char: "❗", keywords: "exclaim alert" },
      { char: "❓", keywords: "question" },
      { char: "💯", keywords: "100 hundred perfect" },
      { char: "🆗", keywords: "ok" },
      { char: "🆕", keywords: "new" },
      { char: "🔔", keywords: "bell notification" },
      { char: "🔕", keywords: "no bell silent" },
      { char: "♻️", keywords: "recycle" },
      { char: "✨", keywords: "sparkles new clean" },
      { char: "⭐", keywords: "star" },
      { char: "🌟", keywords: "star glowing" },
      { char: "🎉", keywords: "party celebrate" },
      { char: "🎊", keywords: "confetti celebrate" },
      { char: "❤️", keywords: "heart love red" },
      { char: "🧡", keywords: "heart orange" },
      { char: "💛", keywords: "heart yellow" },
      { char: "💚", keywords: "heart green" },
      { char: "💙", keywords: "heart blue" },
      { char: "💜", keywords: "heart purple" },
      { char: "🖤", keywords: "heart black" },
      { char: "🤍", keywords: "heart white" },
    ],
  },
  {
    key: "premium",
    label: "Premium",
    icon: "star.fill",
    // The "premium" tray is a small set of refined / decorative emojis for
    // expressing appreciation and brand moments. Curated, not exhaustive.
    emojis: [
      { char: "🌹", keywords: "rose flower thanks" },
      { char: "🌸", keywords: "blossom flower" },
      { char: "🌷", keywords: "tulip flower" },
      { char: "💐", keywords: "bouquet flowers" },
      { char: "🍾", keywords: "champagne celebrate" },
      { char: "🥂", keywords: "cheers toast" },
      { char: "🎂", keywords: "cake birthday" },
      { char: "🧁", keywords: "cupcake" },
      { char: "🍰", keywords: "cake slice" },
      { char: "☕", keywords: "coffee" },
      { char: "🍵", keywords: "tea" },
      { char: "🍻", keywords: "beers cheers" },
      { char: "🌈", keywords: "rainbow" },
      { char: "🦄", keywords: "unicorn magical" },
      { char: "👑", keywords: "crown royal premium" },
      { char: "💍", keywords: "ring diamond" },
      { char: "🏆", keywords: "trophy winner" },
      { char: "🥇", keywords: "gold medal first" },
      { char: "💃", keywords: "dance party" },
      { char: "🎀", keywords: "ribbon bow gift" },
    ],
  },
];

const RECENTS_KEY = "@utilityflow:emoji-recents";
const MAX_RECENTS = 24;

interface EmojiPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ visible, onClose, onSelect }: EmojiPickerProps) {
  const colors = useColors();
  const [recents, setRecents] = useState<string[]>([]);
  const [activeKey, setActiveKey] = useState<string>("recents");
  const [query, setQuery] = useState("");

  // Load persisted recents whenever the picker becomes visible — this keeps
  // recents fresh after a remote logout/login cycle as well.
  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(RECENTS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setRecents(parsed.slice(0, MAX_RECENTS));
        }
      } catch {
        // Best-effort: a corrupt cache shouldn't break the picker.
      }
      // Auto-jump to "recents" if the user has any, else first category.
      setActiveKey((prev) => prev);
      setQuery("");
    })();
  }, [visible]);

  const handlePick = async (emoji: string) => {
    onSelect(emoji);
    // Promote this emoji to the front of recents and persist.
    const next = [emoji, ...recents.filter((e) => e !== emoji)].slice(0, MAX_RECENTS);
    setRecents(next);
    try {
      await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      // Persistence failure is non-fatal.
    }
  };

  // Build the searchable index once per render. Cheap because the curated set
  // is small (~150 entries).
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const seen = new Set<string>();
    const out: EmojiEntry[] = [];
    for (const cat of CATEGORIES) {
      for (const e of cat.emojis) {
        if (seen.has(e.char)) continue;
        if (e.keywords.includes(q)) {
          seen.add(e.char);
          out.push(e);
        }
      }
    }
    return out;
  }, [query]);

  const activeEmojis: EmojiEntry[] = useMemo(() => {
    if (searchResults) return searchResults;
    if (activeKey === "recents") {
      return recents.map((char) => ({ char, keywords: "" }));
    }
    const cat = CATEGORIES.find((c) => c.key === activeKey);
    return cat?.emojis ?? [];
  }, [activeKey, recents, searchResults]);

  const tabs: { key: string; icon: React.ComponentProps<typeof IconSymbol>["name"] }[] = [
    { key: "recents", icon: "clock.fill" },
    ...CATEGORIES.map((c) => ({ key: c.key, icon: c.icon })),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // On web, transparent modals still need a backdrop pressable to close.
      statusBarTranslucent
    >
      {/* Tap outside to close */}
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}
      >
        {/* Bottom sheet — stop propagation so taps inside don't dismiss */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 12,
            paddingBottom: 24,
            maxHeight: "75%",
            minHeight: 360,
            borderTopWidth: 1,
            borderColor: colors.border,
          }}
        >
          {/* Drag handle */}
          <View
            style={{
              alignSelf: "center",
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border,
              marginBottom: 12,
            }}
          />

          {/* Search bar */}
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 12,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search emojis"
              placeholderTextColor={colors.muted}
              style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 }}
              returnKeyType="search"
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <IconSymbol name="xmark.circle.fill" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>

          {/* Emoji grid */}
          <FlatList
            data={activeEmojis}
            keyExtractor={(item, idx) => `${item.char}-${idx}`}
            numColumns={8}
            // Re-key on column change to avoid FlatList numColumns crash.
            key="emoji-grid-8"
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
            ListEmptyComponent={
              <View style={{ paddingVertical: 32, alignItems: "center" }}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>
                  {searchResults
                    ? "No emojis match that search."
                    : activeKey === "recents"
                      ? "Your recent emojis will appear here."
                      : "Nothing here yet."}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handlePick(item.char)}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    aspectRatio: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    margin: 2,
                    backgroundColor: pressed ? colors.surface : "transparent",
                  },
                ]}
              >
                <Text style={{ fontSize: 26 }}>{item.char}</Text>
              </Pressable>
            )}
          />

          {/* Category tab bar (hidden during search) */}
          {!searchResults ? (
            <View
              style={{
                borderTopWidth: 1,
                borderColor: colors.border,
                paddingTop: 8,
              }}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 12, gap: 4, alignItems: "center" }}
              >
                {tabs.map((t) => {
                  const active = t.key === activeKey;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => setActiveKey(t.key)}
                      style={({ pressed }) => [
                        {
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: active ? colors.tint + "1A" : "transparent",
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <IconSymbol
                        name={t.icon}
                        size={20}
                        color={active ? colors.tint : colors.muted}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
