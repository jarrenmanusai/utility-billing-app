import { useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
} from "react-native";

import { Button, ScreenHeader } from "@/components/ui/primitives";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { EmojiPicker } from "@/components/emoji-picker";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { pickImage, uploadImage } from "@/lib/upload";
import { getApiBaseUrl } from "@/constants/oauth";

interface Message {
  id: number;
  conversationId: number;
  senderId: number;
  body: string | null;
  attachmentUrl: string | null;
  attachmentType: string | null;
  createdAt: Date | string;
}

interface ChatViewProps {
  title: string;
  onBack: () => void;
  messages: Message[];
  onSend: (body: string | null, attachmentUrl?: string, attachmentType?: string) => Promise<void>;
  isLoading?: boolean;
}

export function ChatView({ title, onBack, messages, onSend, isLoading }: ChatViewProps) {
  const { user } = useAuth();
  const colors = useColors();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Track caret position so emoji insertions land where the user is typing
  // rather than always being appended at the end. Defaults to end-of-string.
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setSending(true);
    try {
      await onSend(text);
      setInput("");
    } finally {
      setSending(false);
    }
  };

  const handleAttach = async (source: "camera" | "library") => {
    try {
      const uri = await pickImage(source);
      if (!uri) return;
      setSending(true);
      const url = await uploadImage(uri, "chat");
      await onSend(null, url, "image");
    } catch (err: any) {
      Alert.alert("Failed to send", err?.message ?? "Try again.");
    } finally {
      setSending(false);
    }
  };

  /**
   * Show the attachment chooser. On web there's no "Camera" option since we
   * use a hidden file input — going straight to library is also faster on
   * native when the user clearly wants to attach an image, but we still want
   * the camera option for convenience there.
   */
  const handleAttachPress = () => {
    if (Platform.OS === "web") {
      handleAttach("library");
      return;
    }
    Alert.alert("Attach", "Choose source", [
      { text: "Take photo", onPress: () => handleAttach("camera") },
      { text: "Choose from library", onPress: () => handleAttach("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  /**
   * Insert the picked emoji at the caret. We don't auto-close the picker
   * because users frequently send 2-3 emojis in a row.
   */
  const handleEmojiSelect = (emoji: string) => {
    setInput((prev) => {
      const { start, end } = selectionRef.current;
      const safeStart = Math.min(Math.max(start, 0), prev.length);
      const safeEnd = Math.min(Math.max(end, safeStart), prev.length);
      const next = prev.slice(0, safeStart) + emoji + prev.slice(safeEnd);
      // Move caret to right after the inserted emoji.
      const cursor = safeStart + emoji.length;
      selectionRef.current = { start: cursor, end: cursor };
      return next;
    });
  };

  const resolveUrl = (url: string) => (url.startsWith("/") ? `${getApiBaseUrl()}${url}` : url);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader title={title} onBack={onBack} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
          ListEmptyComponent={
            isLoading ? null : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
                <Text className="text-sm text-muted text-center">No messages yet. Say hi!</Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const isMine = item.senderId === user?.id;
            return (
              <View className={`flex-row ${isMine ? "justify-end" : "justify-start"}`}>
                <View
                  className={`rounded-2xl px-3 py-2 max-w-[80%] ${isMine ? "bg-primary" : "bg-surface border border-border"}`}
                >
                  {item.attachmentUrl ? (
                    <Image
                      source={{ uri: resolveUrl(item.attachmentUrl) }}
                      style={{ width: 200, height: 200, borderRadius: 12, marginBottom: 6 }}
                      resizeMode="cover"
                    />
                  ) : null}
                  {item.body ? (
                    <Text className={isMine ? "text-white" : "text-foreground"} style={{ fontSize: 15 }}>
                      {item.body}
                    </Text>
                  ) : null}
                  <Text
                    className={isMine ? "text-white/70" : "text-muted"}
                    style={{ fontSize: 10, marginTop: 2 }}
                  >
                    {formatDateTime(item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
        <View className="flex-row items-center gap-2 px-3 py-2 border-t border-border bg-background">
          <Pressable
            onPress={handleAttachPress}
            hitSlop={8}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Attach photo"
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          >
            <IconSymbol name="paperclip" size={22} color={colors.muted} />
          </Pressable>
          <View className="flex-1 bg-surface rounded-2xl border border-border px-3 h-11 flex-row items-center">
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Type a message…"
              placeholderTextColor={colors.muted}
              style={{
                flex: 1,
                color: colors.text,
                fontSize: 16,
                paddingVertical: 0,
              }}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              onSelectionChange={(e) => {
                selectionRef.current = e.nativeEvent.selection;
              }}
            />
            <Pressable
              onPress={() => setEmojiOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open emoji picker"
              style={({ pressed }) => [
                {
                  paddingLeft: 8,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <IconSymbol name="face.smiling" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <Pressable
            onPress={handleSend}
            hitSlop={8}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            disabled={sending || !input.trim()}
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: input.trim() ? colors.tint : colors.border }}
            >
              <IconSymbol name="paperplane.fill" size={18} color="#fff" />
            </View>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <EmojiPicker
        visible={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onSelect={handleEmojiSelect}
      />
    </ScreenContainer>
  );
}
