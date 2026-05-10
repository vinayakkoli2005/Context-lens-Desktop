import { v4 as uuid } from 'uuid';
import type { Conversation, Message } from '../src/shared/types';

const MAX_MESSAGES = 21; // system + 10 user/assistant pairs

const buildSystemPrompt = (ctx: Conversation['context']): string => {
  if (ctx.type === 'text') {
    return `You are a helpful assistant. The user has selected the following text from their screen:\n\n"""\n${ctx.value}\n"""\n\nHelp them understand, summarize, or discuss it.`;
  }
  return `You are a helpful assistant. The user has shared a screenshot from their screen. Help them understand or discuss it.`;
};

export const createConversation = (
  context: Conversation['context'],
  model: string
): Conversation => ({
  id: uuid(),
  context,
  model,
  messages: [{ role: 'system', content: buildSystemPrompt(context) }]
});

export const appendMessage = (conv: Conversation, msg: Message): Conversation => ({
  ...conv,
  messages: [...conv.messages, msg]
});

export const applyRollingWindow = (conv: Conversation): Conversation => {
  if (conv.messages.length <= MAX_MESSAGES) return conv;
  const system = conv.messages[0];
  const rest = conv.messages.slice(1);
  const dropCount = rest.length - (MAX_MESSAGES - 1);
  const trimmedRest = rest.slice(dropCount);
  return { ...conv, messages: [system, ...trimmedRest] };
};
