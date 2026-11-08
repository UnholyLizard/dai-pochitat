// worker/ai-translate.js
// Cloudflare hosted gemma-4-26b-a4b-it via AI Gateway for translating events and books from Russian.

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

  async function runGemmaJson(prompt, env) {
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
        if (parsed) return parsed;
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
          if (parsed) return parsed;
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
          if (parsed) return parsed;
        }
      } catch (err) {
        console.warn('Gemini fallback translation failed:', err.message);
      }
    }

    return null;
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

    const parsed = await runGemmaJson(prompt, env);
    return {
      title_en: parsed?.title_en?.trim() || '',
      ages_en: parsed?.ages_en?.trim() || '',
      text_en: parsed?.text_en?.trim() || '',
    };
  }

  export async function translateBook({ title_ru, author_ru, annotation_ru, says_ru, language }, env) {
    const prompt = `You are an expert literary translator and bibliographer for a children's and young-adult library ("Дай почитать!").
Translate and adapt the following Russian book record to English (EN) and Montenegrin / Serbian Latinica (ME):

Book Language: ${language || 'ru'}
Title (RU): ${title_ru || ''}
Author (RU): ${author_ru || ''}
Annotation (RU): ${annotation_ru || ''}
Librarian's quote / "Natasha says" (RU): ${says_ru || ''}

Rules:
1. Titles & Authors:
   - For Serbian or Montenegrin books, DO NOT translate the book title into English/Russian literal meanings; preserve original names and transliterate Cyrillic to standard Latinica (č, ć, ž, š, đ).
   - For international books (e.g. Astrid Lindgren, Roald Dahl, Tolkien), use the authentic English title and author name for EN; for ME use the published Montenegrin/Serbian Latinica title and author.
   - For Russian books, use the standard English published title or natural translation for EN, and standard Montenegrin Latinica title for ME.
2. Annotation & Librarian's quote ("Natasha says"):
   - Translate accurately with warmth, lively charm, and good literary style suitable for kids, teens, and families.
   - For ME, write in natural Montenegrin / Serbian Latinica (ijekavian Latin).
3. Output ONLY valid JSON in this exact structure:
{
  "title_en": "...",
  "title_me": "...",
  "author_en": "...",
  "author_me": "...",
  "annotation_en": "...",
  "annotation_me": "...",
  "says_en": "...",
  "says_me": "..."
}`;

    const parsed = await runGemmaJson(prompt, env);
    return {
      title_en: parsed?.title_en?.trim() || '',
      title_me: parsed?.title_me?.trim() || '',
      author_en: parsed?.author_en?.trim() || '',
      author_me: parsed?.author_me?.trim() || '',
      annotation_en: parsed?.annotation_en?.trim() || '',
      annotation_me: parsed?.annotation_me?.trim() || '',
      says_en: parsed?.says_en?.trim() || '',
      says_me: parsed?.says_me?.trim() || '',
    };
  }

