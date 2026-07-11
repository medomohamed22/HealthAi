const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-3.5-flash";

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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function callGemini({ apiKey, prompt, image, json, maxOutputTokens }) {
  const parts = [{ text: prompt }];

  if (image?.base64 && image?.mimeType) {
    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.base64
      }
    });
  }

  // Gemini 3.5 Flash: use the model directly with no fallback models.
  // "low" keeps good reasoning quality while reducing latency on Vercel.
  const generationConfig = {
    maxOutputTokens: Math.min(
      maxOutputTokens || (image ? 4096 : 8192),
      image ? 4096 : 8192
    ),
    thinkingConfig: { thinkingLevel: "low" }
  };

  if (json) generationConfig.responseMimeType = "application/json";

  let response;
  try {
    response = await fetchWithTimeout(
      `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent`,
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
      },
      45_000
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Gemini 3.5 Flash took too long to respond. Please try again.");
    }
    throw error;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `Gemini 3.5 Flash request failed with status ${response.status}.`
    );
  }

  const output = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!output) {
    throw new Error("Gemini 3.5 Flash returned an empty response.");
  }

  if (!json) return output;

  const clean = output
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("Gemini 3.5 Flash returned invalid JSON. Please try again.");
  }
}
