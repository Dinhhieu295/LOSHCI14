import { z } from 'zod';
import { modelText, sendModel } from './provider.js';
import type { AiConnection } from './store.js';

const courseFields = z.strictObject({
  name: z.string().trim().min(1).max(160).nullable(),
  code: z.string().trim().max(40).nullable(),
  instructor: z.string().trim().max(120).nullable(),
  credits: z.number().min(0).max(100).nullable(),
  semester: z.string().trim().max(40).nullable(),
});
const schema = z.toJSONSchema(courseFields);
const createCourse = /^(?:(?:hãy|bạn|mình muốn|tôi muốn)\s+)*(?:thêm|tạo|nhập)\s+(?:(?:giúp|mình|tôi|cho|một)\s+)*môn(?:\s+học)?\s+.{2,}/iu;

export async function extractNewOllamaCourse(connection: AiConnection, text: string, signal: AbortSignal) {
  if (!createCourse.test(text.trim())) return undefined;
  const output = await sendModel(connection, [
    { role: 'user', content: 'Thêm môn Lập trình Python, mã CS111, 2 tín chỉ, cô Phạm An phụ trách.' },
    { role: 'assistant', content: '{"name":"Lập trình Python","code":"CS111","instructor":"Phạm An","credits":2,"semester":null}' },
    { role: 'user', content: text },
  ], 'Trích thông tin của một môn mới. Giữ nguyên tên và mã môn. Bỏ từ xưng hô ở tên giảng viên. Trường thiếu dùng null. Chỉ trả JSON, không suy đoán.', [], signal,
  { name: 'course_fields', schema });
  const answer = modelText(output).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const fields = courseFields.parse(JSON.parse(answer));
    const source = text.normalize('NFC').toLocaleLowerCase('vi');
    const statedCredits = source.match(/(\d+(?:[.,]\d+)?)\s*tín\s*chỉ/u)?.[1];
    if (fields.name && source.includes(fields.name.normalize('NFC').toLocaleLowerCase('vi'))) {
      return Object.fromEntries(Object.entries(fields).filter(([field, value]) => {
        if (typeof value === 'string') return value.length > 0 && source.includes(value.normalize('NFC').toLocaleLowerCase('vi'));
        return field === 'credits' && statedCredits !== undefined && value === Number(statedCredits.replace(',', '.'));
      }));
    }
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof z.ZodError)) throw error;
  }
}
