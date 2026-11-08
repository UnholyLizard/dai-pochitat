// worker/ai-translate.js
// Cloudflare hosted gemma-4-26b-a4b-it via AI Gateway for translating events from Russian to English.

const GEMMA_MODEL = '@cf/google/gemma-4-26b-a4b-it';

function parseJson(text) {
  if (!text) return null;
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1] ?? m[0]);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function translateEvent({ title_ru, ages_ru, text_ru }, env) {
  const prompt = `You are a professional translator for a children's and young-adult library ("Дай почитать!").
Translate the following Russian event fields to natural, engaging English:

Title: ${title_ru || ''}
Target Ages: ${ages_ru || ''}
Description: ${text_ru || ''}

Rules:
- Translate accurately with warmth and good literary style suitable for kids, teens, and families.
- Preserve proper names, book titles or author names appropriately.
- For ages, keep the age range clear (e.g. "для всех" -> "for everyone", "3–6 лет" -> "ages 3–6", "7+ лет" -> "ages 7+").
- Output ONLY valid JSON in this exact structure:
{
  "title_en": "...",
  "ages_en": "...",
  "text_en": "..."
}`;

  // 1. Primary: Cloudflare Workers AI with Gemma-4 via AI Gateway (if configured)
  if (env.AI && typeof env.AI.run === 'function') {
    try {
      const options = env.CF_AI_GATEWAY_ID
        ? { gateway: { id: env.CF_AI_GATEWAY_ID, skipCache: false } }
        : undefined;

      const aiRes = await env.AI.run(
        GEMMA_MODEL,
        {
          messages: [
            { role: 'system', content: 'You are an expert translator. Respond with valid JSON only.' },
            { role: 'user', content: prompt },
          ],
        },
        options
      );

      const rawText = aiRes?.response || aiRes?.choices?.[0]?.message?.content || (typeof aiRes === 'string' ? aiRes : '');
      const parsed = parseJson(rawText);
      if (parsed && (parsed.title_en || parsed.text_en)) {
        return {
          title_en: parsed.title_en?.trim() || '',
          ages_en: parsed.ages_en?.trim() || '',
          text_en: parsed.text_en?.trim() || '',
        };
      }
    } catch (err) {
      console.warn('Workers AI Gemma-4 translation failed, falling back:', err.message);
    }
  }

  // 2. HTTP AI Gateway universal endpoint (if URL provided)
  if (env.CF_AI_GATEWAY_URL) {
    try {
      const res = await fetch(env.CF_AI_GATEWAY_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(env.CF_AI_GATEWAY_TOKEN ? { Authorization: `Bearer ${env.CF_AI_GATEWAY_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          model: GEMMA_MODEL,
          messages: [
            { role: 'system', content: 'You are an expert translator. Respond with valid JSON only.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const rawText = data?.response || data?.choices?.[0]?.message?.content || '';
        const parsed = parseJson(rawText);
        if (parsed && (parsed.title_en || parsed.text_en)) {
          return {
            title_en: parsed.title_en?.trim() || '',
            ages_en: parsed.ages_en?.trim() || '',
            text_en: parsed.text_en?.trim() || '',
          };
        }
      }
    } catch (err) {
      console.warn('AI Gateway HTTP translation failed:', err.message);
    }
  }

  // 3. Fallback to Gemini if configured (useful for local dev environments)
  if (env.GEMINI_API_KEY) {
    try {
      const model = env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsed = parseJson(raw);
        if (parsed) {
          return {
            title_en: parsed.title_en?.trim() || '',
            ages_en: parsed.ages_en?.trim() || '',
            text_en: parsed.text_en?.trim() || '',
          };
        }
      }
    } catch (err) {
      console.warn('Gemini fallback translation failed:', err.message);
    }
  }

  return { title_en: '', ages_en: '', text_en: '' };
}

