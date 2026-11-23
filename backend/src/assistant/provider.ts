import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { askOllamaWorker, checkOllamaAccess, ollamaRelayEnabled } from './ollama-relay.js';
import { HttpError } from '../http/errors.js';
import type { AiConnection } from './store.js';

export type ModelItem = Record<string, unknown>;
export type AssistantTool = { type: string; name: string; description: string; strict: boolean; parameters: Record<string, unknown> };
type OutputFormat = { name: string; schema: Record<string, unknown> };
export type AssistantFile = { name: string; mimeType: 'application/pdf' | 'image/jpeg' | 'image/png'; data: string };
export const defaultGroqModel = 'qwen/qwen3.8-27b';
export const defaultOllamaModel = 'qwen3.5:2b-q4_K_M';

const row = z.record(z.string(), z.unknown());
const textParts = z.array(z.object({ type: z.literal('output_text'), text: z.string() }));
const openAiError = z.object({ error: z.object({ code: z.string().nullish(), type: z.string().nullish() }) });
const geminiError = z.object({ error: z.object({ message: z.string() }) });
const providerNames = { openai: 'OpenAI', gemini: 'Google Gemini', groq: 'GroqCloud', ollama: 'Ollama' };
const openAiQuotaMessages = new Map([
  ['credit_balance_exhausted', 'Tài khoản OpenAI API đã hết credit. Hãy kiểm tra số dư trong Billing.'],
  ['project_spend_limit_exceeded', 'Dự án OpenAI API đã chạm giới hạn chi tiêu. Hãy kiểm tra Limits của dự án.'],
  ['organization_spend_limit_exceeded', 'Tổ chức OpenAI API đã chạm giới hạn chi tiêu. Hãy kiểm tra Limits của tổ chức.'],
  ['organization_usage_limit_exceeded', 'Tổ chức OpenAI API đã chạm hạn mức sử dụng. Hãy kiểm tra Limits của tổ chức.'],
  ['billing_hard_limit_reached', 'Tài khoản OpenAI API đã chạm giới hạn chi tiêu. Hãy kiểm tra Billing và Limits.'],
  ['insufficient_quota', 'Tài khoản OpenAI API chưa có hạn mức khả dụng. Hãy kiểm tra Billing và Limits.'],
]);

export function modelText(output: ModelItem[]) {
  return output.filter((item) => item.type === 'message').flatMap((item) => {
    const content = Array.isArray(item.content) ? item.content.filter((entry) => entry?.type === 'output_text') : [];
    return (textParts.safeParse(content).data ?? []).map((part) => part.text);
  }).join('\n').trim();
}

export function messageWithFile(text: string, file: AssistantFile): ModelItem {
  const data = `data:${file.mimeType};base64,${file.data}`;
  const attachment = file.mimeType === 'application/pdf'
    ? { type: 'input_file', filename: file.name, file_data: data }
    : { type: 'input_image', image_url: data, detail: 'auto' };
  return { role: 'user', content: [{ type: 'input_text', text }, attachment] };
}

async function openAiLimitError(response: Response) {
  const payload = openAiError.safeParse(await response.json().catch(() => null)).data?.error;
  const quotaMessage = openAiQuotaMessages.get(payload?.code ?? '') ?? openAiQuotaMessages.get(payload?.type ?? '');
  if (quotaMessage) return new HttpError(503, quotaMessage, 'ASSISTANT_PROVIDER_QUOTA');

  if (payload?.code === 'rate_limit_exceeded' || payload?.code === 'slow_down' || payload?.type === 'rate_limit_error') {
    return new HttpError(503, `OpenAI đang giới hạn tốc độ gọi API. ${retryAdvice(response)}`, 'ASSISTANT_PROVIDER_RATE_LIMIT');
  }

  return new HttpError(503, 'OpenAI đang giới hạn lượt gọi hoặc đã hết hạn mức. Hãy kiểm tra Limits.', 'ASSISTANT_PROVIDER_LIMIT');
}

function retryAfterSeconds(response: Response) {
  const seconds = Math.ceil(Number(response.headers.get('retry-after')));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

function retryAdvice(response: Response) {
  const seconds = retryAfterSeconds(response);
  return seconds ? `Hãy đợi ít nhất ${seconds} giây rồi thử lại.` : 'Hãy đợi một lúc rồi thử lại.';
}

export class GroqRateLimitError extends HttpError {
  readonly retryAfterSeconds: number | undefined;

  constructor(response: Response) {
    super(503, `GroqCloud đã chạm hạn mức API. ${retryAdvice(response)}`, 'ASSISTANT_PROVIDER_RATE_LIMIT');
    this.retryAfterSeconds = retryAfterSeconds(response);
  }
}

async function requestModel(connection: AiConnection, url: string, payload: object, signal: AbortSignal) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (connection.provider === 'gemini') headers.set('x-goog-api-key', connection.apiKey);
  else if (connection.apiKey) headers.set('Authorization', `Bearer ${connection.apiKey}`);
  const response = await fetch(url, {
    method: 'POST', signal, redirect: 'error',
    headers,
    body: JSON.stringify(payload),
  }).catch((error: unknown) => {
    if (!(error instanceof TypeError) || signal.aborted) throw error;
    const provider = providerNames[connection.provider];
    const code = z.object({ code: z.string() }).safeParse(error.cause).data?.code;
    const message = code === 'EACCES' || code === 'EPERM'
      ? `Môi trường chạy backend LifeOS đang chặn truy cập mạng tới ${provider}.`
      : `Backend LifeOS không kết nối được tới ${provider}. Hãy thử lại.`;
    throw new HttpError(502, message, 'ASSISTANT_PROVIDER_CONNECTION');
  });
  if (response.status === 429) {
    if (connection.provider === 'openai') throw await openAiLimitError(response);
    if (connection.provider === 'groq') throw new GroqRateLimitError(response);
    throw new HttpError(503, 'Nhà cung cấp AI đang giới hạn lượt gọi hoặc đã hết hạn mức.', 'ASSISTANT_PROVIDER_LIMIT');
  }
  if (connection.provider === 'gemini' && response.status === 403) {
    const message = geminiError.safeParse(await response.json().catch(() => null)).data?.error.message;
    if (message && /free tier (?:is not available|unavailable) for this project/i.test(message)) {
      throw new HttpError(502, 'Dự án Google gắn với khóa này chưa có quyền dùng Gemini API miễn phí. Hãy kiểm tra dự án trong Google AI Studio.',
        'ASSISTANT_PROVIDER_GEMINI_FREE_TIER_UNAVAILABLE');
    }
  }
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(502, 'Khóa AI không hợp lệ hoặc chưa có quyền dùng model. Hãy kiểm tra trong Cài đặt.', 'ASSISTANT_PROVIDER_AUTH');
  }
  if (response.status === 400 || response.status === 404) {
    throw new HttpError(502, 'Nhà cung cấp AI từ chối yêu cầu. Hãy kiểm tra khóa, model và loại tệp trong Cài đặt.', 'ASSISTANT_PROVIDER_REQUEST');
  }
  if (!response.ok) throw new HttpError(502, 'Nhà cung cấp AI chưa phản hồi. Hãy thử lại.', 'ASSISTANT_PROVIDER_ERROR');
  return response.json() as Promise<unknown>;
}

type GeminiTurn = { role: 'user' | 'model'; parts: ModelItem[] };

function geminiParts(content: unknown): ModelItem[] {
  if (typeof content === 'string') return [{ text: content }];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part: ModelItem): ModelItem[] => {
    if (part.type === 'input_text') return [{ text: part.text }];
    const value = part.type === 'input_file' ? part.file_data : part.image_url;
    const data = typeof value === 'string' ? /^data:([^;]+);base64,(.+)$/.exec(value) : null;
    return data ? [{ inlineData: { mimeType: data[1], data: data[2] } }] : [];
  });
}

function geminiTurns(input: ModelItem[]): GeminiTurn[] {
  const contents: GeminiTurn[] = [];
  const names = new Map<string, string>();
  const append = (role: GeminiTurn['role'], parts: ModelItem[]) => {
    if (!parts.length) return;
    if (contents.at(-1)?.role === role) contents.at(-1)!.parts.push(...parts);
    else contents.push({ role, parts: [...parts] });
  };
  for (const item of input) {
    if (item.type === 'gemini_turn') append('model', item.parts as ModelItem[]);
    else if (item.type === 'function_call') names.set(String(item.call_id), String(item.name));
    else if (item.type === 'function_call_output') {
      append('user', [{ functionResponse: { name: names.get(String(item.call_id)), response: { result: JSON.parse(String(item.output)) },
        ...(typeof item.providerId === 'string' ? { id: item.providerId } : {}) } }]);
    } else if (item.role === 'user' || item.role === 'assistant') {
      append(item.role === 'assistant' ? 'model' : 'user', geminiParts(item.content));
    }
  }
  return contents;
}

const chatCompletionsReply = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullish(),
      tool_calls: z.array(z.object({
        id: z.string(), type: z.literal('function'),
        function: z.object({ name: z.string(), arguments: z.string() }),
      })).nullish(),
    }),
  })),
});

function chatCompletionsMessages(input: ModelItem[], provider: 'groq' | 'ollama'): ModelItem[] {
  return input.flatMap((item): ModelItem[] => {
    if (item.type === 'chat_completions_message') return [item.message as ModelItem];
    if (item.type === 'function_call_output') {
      return [{ role: 'tool', tool_call_id: item.call_id, content: item.output }];
    }
    if (item.role !== 'user' && item.role !== 'assistant') return [];
    const content = Array.isArray(item.content) ? item.content.flatMap((part: ModelItem): ModelItem[] => {
      if (part.type === 'input_text') return [{ type: 'text', text: part.text }];
      if (part.type === 'input_image') return [{ type: 'image_url', image_url: { url: part.image_url } }];
      if (part.type === 'input_file') {
        throw new HttpError(400, `${providerNames[provider]} đọc ảnh PNG hoặc JPG. Hãy chọn ảnh chụp trang PDF cần đọc.`,
          provider === 'groq' ? 'ASSISTANT_GROQ_PDF_UNSUPPORTED' : 'ASSISTANT_OLLAMA_PDF_UNSUPPORTED');
      }
      return [];
    }) : item.content;
    return [{ role: item.role, content }];
  });
}

async function sendChatCompletions(connection: AiConnection, provider: 'groq' | 'ollama', url: string | null,
  input: ModelItem[], instructions: string, tools: AssistantTool[],
  signal: AbortSignal, format?: OutputFormat): Promise<ModelItem[]> {
  const payload = {
    model: connection.model,
    messages: [{ role: 'system', content: instructions }, ...chatCompletionsMessages(input, provider)],
    max_completion_tokens: format ? 2400 : 1500,
    ...(provider === 'groq' && connection.model === defaultGroqModel ? { reasoning_effort: 'none', reasoning_format: 'hidden' } : {}),
    ...(provider === 'ollama' ? { reasoning_effort: 'none' } : {}),
    ...(tools.length ? { tools: tools.map(({ name, description, parameters }) => {
      const { $schema: _schema, ...toolParameters } = parameters;
      return { type: 'function', function: { name, description, parameters: toolParameters } };
    }) } : {}),
    ...(format ? { response_format: { type: 'json_schema', json_schema: { ...format, strict: true } } } : {}),
  };
  const data = url ? await requestModel(connection, url, payload, signal) : await askOllamaWorker(payload, signal);
  const message = chatCompletionsReply.parse(data).choices[0]?.message;
  if (!message) return [];

  const calls = message.tool_calls ?? [];
  const output: ModelItem[] = calls.map((call) => ({
    type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments,
  }));
  if (calls.length) {
    output.unshift({ type: 'chat_completions_message', message: { role: 'assistant', content: message.content ?? null, tool_calls: calls } });
  }
  if (message.content) output.push({ type: 'message', content: [{ type: 'output_text', text: message.content }] });
  return output;
}

export async function sendModel(
  connection: AiConnection, input: ModelItem[], instructions: string, tools: AssistantTool[], signal: AbortSignal, format?: OutputFormat,
): Promise<ModelItem[]> {
  if (connection.provider === 'groq') {
    return sendChatCompletions(connection, 'groq', 'https://api.groq.com/openai/v1/chat/completions', input, instructions, tools, signal, format);
  }
  if (connection.provider === 'ollama') {
    if (ollamaRelayEnabled) {
      checkOllamaAccess(connection.apiKey);
      return sendChatCompletions({ ...connection, model: defaultOllamaModel }, 'ollama', null, input, instructions, tools, signal, format);
    }
    if (!config.OLLAMA_BASE_URL) throw new HttpError(503, 'Máy chủ chưa kết nối với Ollama.', 'ASSISTANT_UNAVAILABLE');
    const url = new URL('/v1/chat/completions', config.OLLAMA_BASE_URL).href;
    return sendChatCompletions(connection, 'ollama', url, input, instructions, tools, signal, format);
  }

  if (connection.provider === 'openai') {
    const data = await requestModel(connection, 'https://api.openai.com/v1/responses', {
      model: connection.model, instructions, input, tools, store: false,
      include: ['reasoning.encrypted_content'], max_output_tokens: 4000,
      ...(format ? { text: { format: { type: 'json_schema', ...format, strict: true } } } : {}),
    }, signal);
    return z.object({ output: z.array(row) }).parse(data).output;
  }

  const data = await requestModel(connection, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(connection.model)}:generateContent`, {
    contents: geminiTurns(input),
    systemInstruction: { parts: [{ text: instructions }] },
    generationConfig: { maxOutputTokens: 4000,
      ...(format ? { responseMimeType: 'application/json', responseJsonSchema: format.schema } : {}) },
    ...(tools.length ? { tools: [{ functionDeclarations: tools.map(({ name, description, parameters }) => {
      const { $schema: _schema, ...parametersJsonSchema } = parameters;
      return { name, description, parametersJsonSchema };
    }) }] } : {}),
  }, signal);
  const { candidates } = z.object({ candidates: z.array(z.object({ content: z.object({ parts: z.array(row) }).optional() })).optional() }).parse(data);
  const parts = candidates?.[0]?.content?.parts ?? [];
  if (!parts.length) return [];
  const output: ModelItem[] = [{ type: 'gemini_turn', parts }];
  for (const part of parts) {
    const call = z.object({ name: z.string(), args: row.default({}), id: z.string().optional() }).safeParse(part.functionCall);
    if (call.success) output.push({ type: 'function_call', name: call.data.name, arguments: JSON.stringify(call.data.args),
      call_id: call.data.id ?? randomUUID(), providerId: call.data.id });
    if (typeof part.text === 'string' && part.thought !== true) {
      output.push({ type: 'message', content: [{ type: 'output_text', text: part.text }] });
    }
  }
  return output;
}
