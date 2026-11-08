/** One shared chat contract for every mode lobby (tournament, arena). */
export const CHAT_MAX_LENGTH = 240;

export interface ChatMessage {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface ChatView {
  messages: ChatMessage[];
}
