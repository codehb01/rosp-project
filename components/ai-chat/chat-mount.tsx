import { isAiEnabled } from "@/lib/ai/config";
import ChatWidget from "@/components/ai-chat/chat-widget";

/**
 * Renders the chat widget only when AI is enabled. With AI_ENABLED off this
 * renders nothing, so the app is unchanged. The widget itself hides for
 * signed-out users. No auth() call here, so pages stay statically renderable.
 */
export default function ChatMount() {
  if (!isAiEnabled()) return null;
  return <ChatWidget />;
}
