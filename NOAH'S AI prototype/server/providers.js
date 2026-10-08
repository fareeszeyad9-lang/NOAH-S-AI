const catalog = require('../catalog');
const { personalityStyle } = require('./simulate');

const MODEL_IDS = {
  chatgpt: process.env.OPENAI_MODEL || 'gpt-4o',
  claude: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-0',
  deepseek: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  gemini: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, data.error?.message || 'provider_failed');
  return data;
}

async function callChatGPT(key, prompt, system, modelId) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId || MODEL_IDS.chatgpt,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      temperature: 0.4
    })
  });
  const data = await readJson(res);
  return data.choices?.[0]?.message?.content || '';
}

async function callClaude(key, prompt, system, modelId) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId || MODEL_IDS.claude,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await readJson(res);
  return data.content?.map((part) => part.text).join('\n') || '';
}

async function callDeepSeek(key, prompt, system, modelId) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId || MODEL_IDS.deepseek,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }]
    })
  });
  const data = await readJson(res);
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(key, prompt, system, modelId) {
  const model = modelId || MODEL_IDS.gemini;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    })
  });
  const data = await readJson(res);
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text).join('\n') || '';
}

async function callGitHubModels(key, modelId, prompt, system) {
  const res = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json'
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      temperature: 0.4
    })
  });
  const data = await readJson(res);
  return data.choices?.[0]?.message?.content || '';
}

async function callOpenRouter(key, modelId, prompt, system) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_ORIGIN || 'http://127.0.0.1:3847',
      'X-Title': "NOAH'S"
    },
    body: JSON.stringify({
      model: modelId || 'openrouter/free',
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }]
    })
  });
  const data = await readJson(res);
  return data.choices?.[0]?.message?.content || '';
}

const DIRECT = { chatgpt: callChatGPT, claude: callClaude, deepseek: callDeepSeek, gemini: callGemini };

function resolveEntry(id) {
  return catalog.findModel(id) || DIRECT_FALLBACK[id] || null;
}

const DIRECT_FALLBACK = {
  chatgpt: { id: 'chatgpt', provider: 'chatgpt', catalogId: MODEL_IDS.chatgpt, label: 'ChatGPT', kind: 'chat' },
  claude: { id: 'claude', provider: 'claude', catalogId: MODEL_IDS.claude, label: 'Claude', kind: 'chat' },
  deepseek: { id: 'deepseek', provider: 'deepseek', catalogId: MODEL_IDS.deepseek, label: 'DeepSeek', kind: 'chat' },
  gemini: { id: 'gemini', provider: 'gemini', catalogId: MODEL_IDS.gemini, label: 'Gemini', kind: 'chat' }
};

async function invokeEntry(entry, keys, prompt, system) {
  if (!entry || entry.kind === 'tts' || entry.kind === 'agent') return { live: false, text: '', via: '' };
  const provider = entry.provider;
  if (provider === 'github_models') {
    if (!keys.github_models) return { live: false, text: '', via: '' };
    const text = await callGitHubModels(keys.github_models, entry.catalogId, prompt, system);
    return { live: Boolean(text.trim()), text: text.trim(), via: entry.label };
  }
  if (provider === 'openrouter') {
    if (!keys.openrouter) return { live: false, text: '', via: '' };
    const text = await callOpenRouter(keys.openrouter, entry.catalogId, prompt, system);
    return { live: Boolean(text.trim()), text: text.trim(), via: entry.label };
  }
  const fn = DIRECT[provider];
  if (!fn || !keys[provider]) return { live: false, text: '', via: '' };
  const text = await fn(keys[provider], prompt, system, entry.catalogId);
  return { live: Boolean(text.trim()), text: text.trim(), via: entry.label };
}

async function tryLive(id, keys, prompt, preset, extraSystem = '') {
  const system = `You are NOAH'S, a personal orchestrator. ${personalityStyle(preset)} Never claim you changed files. Be honest if uncertain. ${extraSystem}`.trim();
  const entry = resolveEntry(id);
  if (!entry) return { live: false, text: '', via: '' };
  try {
    return await invokeEntry(entry, keys, prompt, system);
  } catch (err) {
    if (err.status === 429) {
      const rotated = new Error('rate_limited');
      rotated.status = 429;
      throw rotated;
    }
    return { live: false, text: '', via: '' };
  }
}

function orderedPool(role, rolePools) {
  const ids = rolePools?.[role] || catalog.defaultRolePools()[role];
  const byId = Object.fromEntries(catalog.ROLE_POOLS[role].map((m) => [m.id, m]));
  return ids.map((id) => byId[id]).filter(Boolean);
}

async function tryRole(role, keys, prompt, preset, rolePools, extraSystem = '') {
  const pool = orderedPool(role, rolePools);
  let lastNon429 = { live: false, text: '', via: '' };
  for (const entry of pool) {
    try {
      const result = await invokeEntry(entry, keys, prompt, `You are NOAH'S. ${personalityStyle(preset)} ${extraSystem}`);
      if (result.live) return { ...result, rotated: false };
    } catch (err) {
      if (err.status === 429) continue;
      lastNon429 = { live: false, text: '', via: '' };
      break;
    }
  }
  return lastNon429;
}

async function tryWithRotation(id, keys, prompt, preset, rolePools, extraSystem = '') {
  try {
    const direct = await tryLive(id, keys, prompt, preset, extraSystem);
    if (direct.live) return { ...direct, rotated: false };
  } catch (err) {
    if (err.status === 429) {
      const entry = resolveEntry(id);
      const role = Object.keys(catalog.ROLE_POOLS).find((r) => catalog.ROLE_POOLS[r].some((m) => m.id === id));
      if (role && role !== 'domain_khusus' && role !== 'voice_tts') {
        const rotated = await tryRole(role, keys, prompt, preset, rolePools, extraSystem);
        if (rotated.live) return { ...rotated, rotated: true };
      }
    } else {
      return { live: false, text: '', via: '' };
    }
  }
  const entry = resolveEntry(id);
  if (entry?.provider === 'github_models' || entry?.provider === 'openrouter') {
    try {
      const open = await invokeEntry({
        id: 'openrouter-free', provider: 'openrouter', catalogId: 'openrouter/free', label: 'OpenRouter Free Router', kind: 'chat'
      }, keys, prompt, `You are NOAH'S. ${personalityStyle(preset)} ${extraSystem}`);
      if (open.live) return { ...open, rotated: true };
    } catch (err) {
      if (err.status !== 429) return { live: false, text: '', via: '' };
    }
  }
  return { live: false, text: '', via: '' };
}

function keyPresence(keys) {
  return {
    chatgpt: Boolean(keys.chatgpt),
    claude: Boolean(keys.claude),
    deepseek: Boolean(keys.deepseek),
    gemini: Boolean(keys.gemini),
    github_models: Boolean(keys.github_models),
    openrouter: Boolean(keys.openrouter)
  };
}

module.exports = {
  tryLive,
  tryWithRotation,
  tryRole,
  keyPresence,
  MODEL_IDS,
  callGitHubModels,
  callGemini,
  callOpenRouter
};
