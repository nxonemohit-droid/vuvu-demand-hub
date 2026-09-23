// Shared JSON generation helper.
// Primary: the workspace Gemini key (paid, fast, cheap).
// Fallback: Lovable AI Gateway Responses API.
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
// gemini-2.5-flash is retired for new access; 3.5-flash is the current fast model.
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";

type Schema = Record<string, unknown>;

/** Strip json-schema keys Gemini's responseSchema does not accept. */
function geminiSchema(schema: Schema): Schema {
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "additionalProperties" || k === "$schema") continue;
        out[k] = clean(v);
      }
      return out;
    }
    return node;
  };
  return clean(schema) as Schema;
}

async function viaGemini(instructions: string, input: string, schema: Schema) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: "user", parts: [{ text: input }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: geminiSchema(schema),
          temperature: 0.7,
        },
      }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  const out = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!out) throw new Error("Gemini returned no text");
  return JSON.parse(out);
}

async function viaLovable(instructions: string, input: string, schema: Schema) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_KEY!,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      store: false,
      instructions,
      input: [{ role: "user", content: [{ type: "input_text", text: input }] }],
      text: { format: { type: "json_schema", name: "out", strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "response.output_text.delta" && ev.delta) text += ev.delta;
      } catch { /* partial frame */ }
    }
  }
  if (!text.trim()) throw new Error("AI gateway returned an empty response");
  return JSON.parse(text);
}

/** Returns parsed JSON matching `schema`, or null when no provider succeeds. */
export async function aiJson(
  instructions: string,
  input: string,
  schema: Schema,
): Promise<Record<string, unknown> | null> {
  if (GEMINI_KEY) {
    try {
      return await viaGemini(instructions, input, schema);
    } catch (e) {
      console.error("gemini failed, falling back", String(e).slice(0, 300));
    }
  }
  if (LOVABLE_KEY) {
    try {
      return await viaLovable(instructions, input, schema);
    } catch (e) {
      console.error("lovable gateway failed", String(e).slice(0, 300));
    }
  }
  return null;
}

export const aiProvider = () => (GEMINI_KEY ? "gemini" : LOVABLE_KEY ? "lovable" : "none");
