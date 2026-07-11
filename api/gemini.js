import {
  applyCommonHeaders,
  callGemini,
  checkOrigin,
  getBody
} from "./_shared.js";

export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  applyCommonHeaders(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!checkOrigin(req)) {
    return res.status(403).json({ error: "Origin is not allowed." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not configured on the server."
    });
  }

  const body = getBody(req);
  if (!body || typeof body.prompt !== "string") {
    return res.status(400).json({ error: "A valid prompt is required." });
  }

  const mode = body.mode === "vision" ? "vision" : "text";
  const prompt = body.prompt.trim();

  if (!prompt || prompt.length > 30000) {
    return res.status(400).json({
      error: "The prompt is empty or too long."
    });
  }

  let image;
  if (mode === "vision") {
    const base64 = body.image?.base64;
    const mimeType = body.image?.mimeType;

    if (
      typeof base64 !== "string" ||
      typeof mimeType !== "string" ||
      !mimeType.startsWith("image/")
    ) {
      return res.status(400).json({ error: "A valid image is required." });
    }

    // Roughly 5 MB after base64 encoding; frontend compresses before upload.
    if (base64.length > 7_000_000) {
      return res.status(413).json({ error: "The image is too large." });
    }

    image = { base64, mimeType };
  }

  try {
    const result = await callGemini({
      apiKey,
      prompt,
      image,
      json: body.json !== false,
      maxOutputTokens: mode === "vision" ? 4096 : 8192
    });

    return res.status(200).json({ result });
  } catch (error) {
    console.error("Gemini API error:", error);
    return res.status(502).json({
      error: error?.message || "Gemini request failed."
    });
  }
}
