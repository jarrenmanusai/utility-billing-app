/**
 * LLM service for meter reading OCR.
 * Uses OpenAI-compatible API (works with OpenAI, Gemini, etc.).
 */

import { ENV } from "./env.js";

export interface OcrResult {
  reading: number | null;
  amount: number | null;
  date: string | null;
  confidence: "high" | "medium" | "low";
}

export async function ocrMeterImage(imageUrl: string): Promise<OcrResult> {
  if (!ENV.openaiApiKey) {
    console.warn("[OCR] No OPENAI_API_KEY configured — returning empty result");
    return { reading: null, amount: null, date: null, confidence: "low" };
  }

  const apiUrl = `${ENV.openaiBaseUrl.replace(/\/$/, "")}/chat/completions`;

  const payload = {
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a meter reading extractor. Read the digits on the utility meter or the amount/date on a payment receipt and return JSON.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: 'Extract from this image. Respond ONLY with a JSON object: {"reading": <number or null>, "amount": <number or null>, "date": <YYYY-MM-DD or null>, "confidence": "high"|"medium"|"low"}. \'reading\' is for meter dials. \'amount\' is for receipts (in PHP).',
          },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 256,
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.openaiApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OCR] LLM request failed: ${response.status} ${errorText}`);
      return { reading: null, amount: null, date: null, confidence: "low" };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    const data = JSON.parse(content);

    return {
      reading: typeof data.reading === "number" ? data.reading : null,
      amount: typeof data.amount === "number" ? data.amount : null,
      date: typeof data.date === "string" ? data.date : null,
      confidence: ["high", "medium", "low"].includes(data.confidence) ? data.confidence : "low",
    };
  } catch (err) {
    console.error("[OCR] failed:", err);
    return { reading: null, amount: null, date: null, confidence: "low" };
  }
}
