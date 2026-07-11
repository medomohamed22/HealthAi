const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export function applyCommonHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function checkOrigin(req) {
  const allowed = process.env.ALLOWED_ORIGIN?.trim();
  if (!allowed) return true;

  const origin = req.headers.origin;
  if (!origin) return true;

  return origin === allowed;
}

export function getBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body || null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export async function getGeminiModels(apiKey) {
  const preferred = unique([
    process.env.GEMINI_MODEL,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest"
  ]);

  try {
    const response = await fetch(`${GEMINI_API_BASE}/models?pageSize=100`, {
      headers: { "x-goog-api-key": apiKey }
    });

    if (!response.ok) return preferred;

    const data = await response.json();
    const available = (data.models || [])
      .filter((model) =>
        Array.isArray(model.supportedGenerationMethods) &&
        model.supportedGenerationMethods.includes("generateContent")
      )
      .map((model) => String(model.name || "").replace(/^models\//, ""))
      .filter((name) =>
        /gemini/i.test(name) &&
        !/image-generation|embedding|tts|audio|live/i.test(name)
      );

    return unique([
      ...preferred.filter((model) => available.includes(model)),
      ...available,
      ...preferred
    ]);
  } catch {
    return preferred;
  }
}

export async function callGemini({ apiKey, prompt, image, json, maxOutputTokens }) {
  const models = await getGeminiModels(apiKey);
  let lastError = "Gemini request failed.";

  for (const model of models) {
    try {
      const parts = [{ text: prompt }];

      if (image?.base64 && image?.mimeType) {
        parts.push({
          inlineData: {
            mimeType: image.mimeType,
            data: image.base64
          }
        });
      }

      const generationConfig = {
        temperature: image ? 0.2 : 0.35,
        maxOutputTokens: maxOutputTokens || (image ? 5000 : 20000)
      };

      if (json) generationConfig.responseMimeType = "application/json";

      const response = await fetch(
        `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        lastError = data?.error?.message || `Model ${model} failed.`;
        continue;
      }

      const output = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();

      if (!output) {
        lastError = `Model ${model} returned an empty response.`;
        continue;
      }

      if (!json) return output;

      const clean = output
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      return JSON.parse(clean);
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }

  throw new Error(lastError);
}
