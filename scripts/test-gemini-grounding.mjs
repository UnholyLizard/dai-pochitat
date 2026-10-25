import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf-8');
const keyMatch = env.match(/GEMINI_API_KEY='([^']+)'/);
const key = keyMatch ? keyMatch[1] : '';

if (!key) {
  console.error('No GEMINI_API_KEY found in .env');
  process.exit(1);
}

// Test with gemini-3.8-flash
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`;

const payload = {
  contents: [{
    parts: [{
      text: 'Find the official Russian publisher, ISBN, publication year, and official cover image link for the children book: "Где живет птичка", author "Елена Цветаева", publisher "Клевер". Return JSON with fields: title, author, publisher, isbn, year, cover_image_url, summary.'
    }]
  }],
  tools: [{
    google_search: {}
  }],
  generationConfig: {
    temperature: 0.1
  }
};

console.log('Sending request to Gemini with Google Search grounding...');
const res = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

console.log('Response Status:', res.status);
const data = await res.json();
if (!res.ok) {
  console.error('Error response:', JSON.stringify(data, null, 2));
} else {
  const candidate = data.candidates?.[0];
  const textPart = candidate?.content?.parts?.find(p => p.text);
  console.log('\n=== GEMINI ANSWER ===');
  console.log(textPart?.text || 'No text');
  
  if (candidate?.groundingMetadata) {
    console.log('\n=== GROUNDING METADATA ===');
    console.log('Web queries:', candidate.groundingMetadata.webSearchQueries);
    console.log('Sources count:', candidate.groundingMetadata.groundingChunks?.length || 0);
    const sampleSources = (candidate.groundingMetadata.groundingChunks || []).slice(0, 3).map(c => c.web?.uri || c.web?.title);
    console.log('Sample sources:', sampleSources);
  }
}
