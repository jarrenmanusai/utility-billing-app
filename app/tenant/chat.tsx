import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";

import { ChatView } from "@/components/chat-view";
import { trpc } from "@/lib/trpc";

export default function TenantChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const id = Number(conversationId);

  const messages = trpc.tenant.chat.messages.useQuery({ conversationId: id }, { refetchInterval: 4000 });
  const utils = trpc.useUtils();
  const send = trpc.tenant.chat.send.useMutation({
    onSuccess: () => utils.tenant.chat.messages.invalidate({ conversationId: id }),
  });

  useEffect(() => {
    const i = setInterval(() => messages.refetch(), 4000);
    return () => clearInterval(i);
  }, [id]);

  return (
    <ChatView
      title="Landlord"
      onBack={() => router.back()}
      messages={(messages.data ?? []) as any}
      isLoading={messages.isLoading}
      onSend={async (body, attachmentUrl, attachmentType) => {
        await send.mutateAsync({ conversationId: id, body: body ?? undefined, attachmentUrl, attachmentType });
      }}
    />
  );
}
