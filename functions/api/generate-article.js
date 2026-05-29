import { buildArticlePrompt } from "../../lib/prompts.js";
import { checkLimit } from "../../lib/rate-limit.js";

async function callDeepSeek(messages, apiKey) {
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      response_format: { type: "json_object" },
      max_tokens: 8000,
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

export async function onRequestPost(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const body = await context.request.json();
    const { words, level, deviceId, unlockCode } = body;

    if (!words || !Array.isArray(words) || words.length === 0) {
      return new Response(JSON.stringify({ error: "请提供单词列表" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit check
    const ip = context.request.headers.get("cf-connecting-ip") || "unknown";
    const limit = checkLimit(ip, deviceId, unlockCode, context.env.UNLOCK_CODES);

    if (!limit.allowed) {
      return new Response(
        JSON.stringify({
          error: `免费使用次数已用完（${limit.limit}次）`,
          contact: limit.contact,
          limitReached: true,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = context.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API Key 未配置" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages = buildArticlePrompt(words, level);
    const result = await callDeepSeek(messages, apiKey);

    return new Response(
      JSON.stringify({
        ...result,
        usage: { remaining: limit.remaining, limit: limit.limit, used: limit.used, unlimited: limit.unlimited },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-article error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
