(function (root, factory) {
  const data = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.NOAHS_CATALOG = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ROLE_POOLS = {
    general: [
      { id: 'gemma-4-26b-a4b', provider: 'github_models', catalogId: 'google/gemma-4-26B-A4B-it', label: 'Gemma 4 26B A4B', logo: '◎', color: '#4ea1ff', note: 'cepat & hemat, default harian', sub: 'Dipilih', pros: 'Ringan untuk tugas harian', cons: 'Kurang dalam untuk kasus sulit', kind: 'chat' },
      { id: 'gemma-4-31b', provider: 'github_models', catalogId: 'google/gemma-4-31B-it', label: 'Gemma 4 31B', logo: '◉', color: '#5ad0e8', note: 'paling pintar tapi berat', sub: 'Model general', pros: 'Kualitas jawaban lebih tinggi', cons: 'Lebih lambat / mahal kuota', kind: 'chat' },
      { id: 'inkling', provider: 'github_models', catalogId: 'thinkingmachines/inkling', label: 'Inkling', logo: '✦', color: '#8aa0c2', note: 'penalaran terdalam + multimodal, kasus sulit', sub: 'Model general', pros: 'Penalaran dalam, multimodal', cons: 'Berat; jangan untuk chat pendek', kind: 'chat' },
      { id: 'nemotron-3.5-lightning', provider: 'github_models', catalogId: 'nvidia/nemotron-3.5-lightning-30b-a3b', label: 'Nemotron 3.5 Lightning', logo: '⚡', color: '#3ecf8e', note: 'konteks 1 juta token, cepat', sub: 'Model general', pros: 'Konteks sangat panjang', cons: 'Bukan pilihan domain khusus', kind: 'chat' },
      { id: 'minimax-m3', provider: 'github_models', catalogId: 'minimax/minimax-m3', label: 'MiniMax M3', logo: '◇', color: '#9b7dff', note: 'multibahasa/kreatif', sub: 'Model general', pros: 'Kreatif & multibahasa', cons: 'Kurang ketat untuk audit kode', kind: 'chat' }
    ],
    coding: [
      { id: 'laguna-s-2.1', provider: 'github_models', catalogId: 'poolside/laguna-s-2.1', label: 'Laguna S 2.1', logo: '⌘', color: '#f0a14a', note: 'agent SWE penuh, 1 juta token konteks', sub: 'Dipilih', pros: 'Kuat untuk tugas coding besar', cons: 'Bisa lambat; butuh key GitHub Models', kind: 'chat' },
      { id: 'north-mini-code', provider: 'github_models', catalogId: 'cohere/north-mini-code-1.0', label: 'North Mini Code', logo: '⌥', color: '#8b95ad', note: 'ringan & cepat, autocomplete/debug', sub: 'Model coding', pros: 'Cepat untuk snippet', cons: 'Bukan agent multi-file', kind: 'chat' },
      { id: 'qwen3-coder', provider: 'github_models', catalogId: 'qwen/qwen3-coder', label: 'Qwen3-Coder', logo: '▣', color: '#c6d94a', note: 'cek ketersediaan di katalog GitHub Models', sub: 'Cek ketersediaan', pros: 'Fokus kode', cons: 'ID katalog harus diverifikasi', kind: 'chat' },
      { id: 'openrouter-free', provider: 'openrouter', catalogId: 'openrouter/free', label: 'OpenRouter Free Router', logo: '↻', color: '#3aa8b5', note: 'cadangan lintas-provider, kuota terpisah', sub: 'Fallback otomatis', pros: 'Fallback otomatis model gratis', cons: 'Kualitas tidak tetap', kind: 'chat' }
    ],
    domain_khusus: [
      { id: 'ling-3.0-flash-fin', provider: 'github_models', catalogId: 'inclusionAI/ling-3.0-flash-fin', label: 'Ling 3.0 Flash Fin', logo: '¤', color: '#3ecf8e', note: 'khusus finansial', sub: 'Finansial', pros: 'Bahasa finansial', cons: 'Tidak ikut rotasi otomatis chat umum', kind: 'chat' },
      { id: 'ling-3.0-flash-sante', provider: 'github_models', catalogId: 'inclusionAI/ling-3.0-flash-sante', label: 'Ling 3.0 Flash Sante', logo: '+', color: '#4ec4c8', note: 'khusus medis/kesehatan', sub: 'Kesehatan', pros: 'Bahasa kesehatan', cons: 'Bukan nasihat medis; tidak auto-rotasi', kind: 'chat' },
      { id: 'dots3-note-preview', provider: 'github_models', catalogId: 'inclusionAI/dots3-note-preview', label: 'Dots3-Note Preview', logo: '✎', color: '#e8c547', note: 'rangkum transkrip jadi poin', sub: 'Catatan · preview', pros: 'Ringkas transkrip', cons: 'Preview; cek ID katalog', kind: 'chat' }
    ],
    voice_tts: [
      { id: 's2.1-pro', provider: 'github_models', catalogId: 'fishaudio/s2.1-pro', label: 'S2.1 Pro (Fish Audio)', logo: '◉', color: '#e24b5a', note: 'kloning suara ekspresif, 83 bahasa', sub: 'Teks ke suara', pros: 'TTS ekspresif', cons: 'Bukan model chat; tidak dikirim ke /api/chat', kind: 'tts' },
      { id: 'flux-tts', provider: 'github_models', catalogId: 'flux/flux-tts', label: 'Flux TTS', logo: '◌', color: '#d45ec8', note: 'audio paling jernih, agak lebih lambat', sub: 'Teks ke suara', pros: 'Kualitas audio tinggi', cons: 'Lebih lambat; bukan chat', kind: 'tts' }
    ]
  };

  const DIRECT_MODELS = [
    { id: 'gemini', provider: 'gemini', catalogId: 'gemini-2.5-flash', label: 'Gemini', logo: '⟡', color: '#4ea1ff', note: 'Mulai percakapan melalui akses langsung. Terpisah dari koleksi GitHub Models.', sub: 'Flash · tier gratis', badge: 'AI UTAMA', pros: 'Cepat, multimodal, tier gratis', cons: 'Privasi: data boleh dipakai Google di tier gratis', kind: 'chat', type: 'Model chat langsung' },
    { id: 'chatgpt', provider: 'chatgpt', catalogId: 'gpt-4o', label: 'ChatGPT', logo: '◎', color: '#2f7d4a', note: 'Opsi luas · garis besar cepat', pros: 'Garis besar cepat', cons: 'Butuh key OpenAI berbayar', kind: 'chat', type: 'Model chat langsung' },
    { id: 'claude', provider: 'claude', catalogId: 'claude-sonnet-4-0', label: 'Claude', logo: '◇', color: '#c47a3a', note: 'Hati-hati · edge case · risiko', pros: 'Hati-hati pada risiko', cons: 'Butuh key Anthropic', kind: 'chat', type: 'Model chat langsung' },
    { id: 'deepseek', provider: 'deepseek', catalogId: 'deepseek-chat', label: 'DeepSeek', logo: '✦', color: '#3d6bb3', note: 'Reasoning · coding · teaching', pros: 'Kuat reasoning/coding', cons: 'API berbayar; tidak masuk cadangan gratis', kind: 'chat', type: 'Model chat langsung' }
  ];

  const CODING_AGENTS = [
    { id: 'cursor', name: 'Cursor', label: 'Cursor', logo: '⌘', color: '#3ecf8e', state: 'External agent', className: 'offline', capability: 'Refactor interaktif jika di-bridge', note: 'Penyuntingan kode interaktif di editor.', sub: 'Coding agent', group: 'code_maker', pros: 'Cocok refactor bertahap', cons: 'Tidak terhubung; perlu akun Cursor sendiri', kind: 'agent' },
    { id: 'windsurf', name: 'Windsurf', label: 'Windsurf', logo: '≈', color: '#3ecf8e', state: 'Not connected', className: 'offline', capability: 'Alur besar jika di-bridge', note: 'Alur kerja end-to-end setelah slice kecil.', sub: 'Coding agent', group: 'code_maker', pros: 'Alur besar', cons: 'Tidak terhubung; perlu akun Windsurf', kind: 'agent' },
    { id: 'devin', name: 'Devin', label: 'Devin', logo: '▣', color: '#9b7dff', state: 'External agent', className: 'offline', capability: 'Perlu akun Cognition/Devin sendiri', note: 'Tugas multi-file otonom. Bukan login Google.', sub: 'Coding agent', group: 'autonomous_agent', pros: 'Rencana lintas file', cons: 'External; perlu akun Cognition', kind: 'agent' },
    { id: 'copilot', name: 'GitHub Copilot', label: 'GitHub Copilot', logo: '⌥', color: '#9b7dff', state: 'External agent', className: 'offline', capability: 'Perlu akun GitHub/Copilot sendiri', note: 'Potongan kode kecil/inline. Bukan login Google.', sub: 'Dipilih', group: 'inline_helper', pros: 'Snippet cepat', cons: 'External; perlu akun GitHub/Copilot', kind: 'agent' }
  ];

  const AGENT_GROUPS = {
    code_maker: { label: 'Code Maker', members: ['cursor', 'windsurf'], note: 'penyuntingan kode interaktif' },
    autonomous_agent: { label: 'Autonomous Agent', members: ['devin'], note: 'tugas multi-file otonom' },
    inline_helper: { label: 'Inline Helper', members: ['copilot'], note: 'potongan kode kecil/cepat' }
  };

  function allRoleModels() {
    return Object.values(ROLE_POOLS).flat();
  }

  function findModel(id) {
    return DIRECT_MODELS.concat(allRoleModels(), CODING_AGENTS).find((m) => m.id === id) || null;
  }

  function defaultRolePools() {
    const copy = {};
    for (const [role, list] of Object.entries(ROLE_POOLS)) copy[role] = list.map((m) => m.id);
    return copy;
  }

  return { ROLE_POOLS, DIRECT_MODELS, CODING_AGENTS, AGENT_GROUPS, allRoleModels, findModel, defaultRolePools };
});
