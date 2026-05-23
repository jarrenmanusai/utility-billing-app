import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";

import { ChatView } from "@/components/chat-view";
import { trpc } from "@/lib/trpc";

export default function LandlordChatScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const conversationId = Number(id);

  const messages = trpc.landlord.chat.messages.useQuery(
    { conversationId },
    { refetchInterval: 4000 },
  );
  const utils = trpc.useUtils();
  const send = trpc.landlord.chat.send.useMutation({
    onSuccess: () => utils.landlord.chat.messages.invalidate({ conversationId }),
  });

  useEffect(() => {
    const i = setInterval(() => messages.refetch(), 4000);
    return () => clearInterval(i);
  }, [conversationId]);

  return (
    <ChatView
      title={name ? String(name) : "Conversation"}
      onBack={() => router.back()}
      messages={(messages.data ?? []) as any}
      isLoading={messages.isLoading}
      onSend={async (body, attachmentUrl, attachmentType) => {
        await send.mutateAsync({ conversationId, body: body ?? undefined, attachmentUrl, attachmentType });
      }}
    />
  );
}
