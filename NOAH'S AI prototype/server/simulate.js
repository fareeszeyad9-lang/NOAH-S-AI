function personalityStyle(preset) {
  return {
    formal: 'Gaya formal, ringkas, tanpa slang.',
    santai: 'Gaya santai, ramah, kalimat pendek.',
    tegas: 'Gaya tegas, langsung ke keputusan dan batasan.',
    hangat: 'Gaya hangat, jelas, tetap jujur soal batas kemampuan.'
  }[preset] || 'Gaya hangat, jelas, tetap jujur soal batas kemampuan.';
}

function compactHint(compact) {
  return compact ? ' Balasan harus lebih ringkas dari biasanya karena umpan balik pengguna.' : '';
}

function learningQuestion(topic) {
  const questions = {
    risk: 'Coba jelaskan ulang dengan kata-katamu: kenapa mulai dari satu alur, bukan banyak integrasi?',
    architecture: 'Coba jelaskan ulang: apa yang dimaksud adapter, dan kenapa otak sistem tidak boleh tergantung satu channel?',
    mvp: 'Coba jelaskan ulang: apa yang membuat sebuah versi “sudah berguna” meski fiturnya masih sedikit?',
    build: 'Coba jelaskan ulang: apa bedanya memahami langkah membangun dengan langsung mengubah file?',
    default: 'Coba jelaskan ulang dengan kata-katamu: apa keputusan terkecil yang paling berguna sekarang?'
  };
  return `<p class="check-question"><b>Cek pemahaman:</b> ${questions[topic] || questions.default}</p>`;
}

function createLearningResponse(input, project, compact) {
  const lower = input.toLowerCase();
  const hint = compactHint(compact);
  const illustration = `<span class="illustration-label">Contoh ilustrasi (tidak diusulkan sebagai perubahan file)</span><pre class="code-illustration">function nextStep(goal) {\n  return \`Pahami \${goal}, baru rancang langkah kecil.\`;\n}</pre>`;
  const tag = '<br><span class="sim-badge">SIMULASI</span><span class="route-tag">Learning · apa / kenapa / bagaimana</span>';
  if (lower.includes('risiko') || lower.includes('risk')) {
    return `Apa: risiko adalah hal yang bisa membuat ${project.name} gagal meski idenya bagus.<br>Kenapa: biasanya karena terlalu banyak integrasi terlalu cepat.${hint}<br>Bagaimana: pelajari dulu satu kebiasaan inti, baru pikirkan channel atau API.<br>${illustration}${learningQuestion('risk')}${tag}`;
  }
  if (lower.includes('arsitektur') || lower.includes('architecture')) {
    return `Apa: arsitektur adalah peta bagian sistem.<br>Kenapa: peta kecil lebih mudah dipahami.${hint}<br>Bagaimana: ingat rantai <b>input → session → task router → formatter</b>.<br>${illustration}${learningQuestion('architecture')}${tag}`;
  }
  if (lower.includes('mvp') || lower.includes('rencana') || lower.includes('plan')) {
    return `Apa: MVP adalah versi terkecil yang sudah berguna.<br>Kenapa: belajar dari pemakaian nyata.${hint}<br>Bagaimana: satu alur dulu, baru integrasi.<br>${illustration}${learningQuestion('mvp')}${tag}`;
  }
  if (lower.includes('file') || lower.includes('kode') || lower.includes('code') || lower.includes('build')) {
    return `Apa: “membangun” di sini berarti memahami langkahnya, bukan mengubah workspace.<br>Kenapa: Learning mode tidak membuat approval dan tidak mengirim ke coding agent.${hint}<br>Bagaimana: pecah permintaan jadi konsep.<br>${illustration}${learningQuestion('build')}${tag}`;
  }
  const shown = input.slice(0, 140);
  return `Saya jelaskan untuk <b>${project.name}</b>.<br><b>Apa:</b> ${shown}<br><b>Kenapa:</b> keputusan yang dipahami lebih tahan lama.${hint}<br><b>Bagaimana:</b> simpan satu kesimpulan, tanyakan yang masih kabur.<br>${illustration}${learningQuestion('default')}${tag}`;
}

function createGhostResponse(input, project, modelName) {
  const lower = input.toLowerCase();
  if (lower.includes('risiko') || lower.includes('risk')) {
    return `The biggest risk for <b>${project.name}</b> is connecting every channel before the core habit works. Start with one dashboard flow, then add integrations behind a capability check.<br><span class="sim-badge">SIMULASI</span><span class="route-tag">Ghost analysis · risk-first</span>`;
  }
  return `Pressure-test: keep the claim honest. ${modelName} may be live or simulated; Cursor/Windsurf/Copilot/Devin stay external until a real bridge exists. Input: “${input.slice(0, 120)}”.<br><span class="sim-badge">SIMULASI</span><span class="route-tag">Ghost · strategy</span>`;
}

function createModelProposals(input, project, compact) {
  const goal = input.slice(0, 180);
  const extra = compact ? ' Ringkas.' : '';
  return [
    { id: 'chatgpt', name: 'ChatGPT', text: `Garis besar cepat untuk <b>${project.name}</b>: pecah “${goal}” jadi 3 opsi, pilih yang bisa diuji minggu ini.${extra}` },
    { id: 'claude', name: 'Claude', text: `Versi hati-hati: catat edge case (data kosong, user baru, gagal simpan) dan rollback. Usulan “${goal}” hanya aman dengan approval manusia.${extra}` },
    { id: 'deepseek', name: 'DeepSeek', text: `Slice teknis untuk “${goal}”: (1) kontrak data, (2) UI minimum, (3) state, (4) tes manual.${extra}` },
    { id: 'gemini', name: 'Gemini', text: `Sudut multimodal/konteks: pastikan “${goal}” punya satu jalur bahagia yang bisa dijelaskan ke orang non-teknis, lalu lampirkan bukti/contoh.${extra}` }
  ];
}

function createCrossReviews(proposals) {
  const names = new Set(proposals.map((item) => item.name));
  return [
    { from: 'Claude', of: 'ChatGPT', text: 'menandai opsi terlalu luas, sarankan kriteria “bisa diuji minggu ini”.' },
    { from: 'DeepSeek', of: 'ChatGPT', text: 'menyoroti kurangnya urutan implementasi; sarankan kontrak data dulu.' },
    { from: 'Gemini', of: 'ChatGPT', text: 'minta satu contoh konkret yang bisa ditunjukkan ke pengguna.' },
    { from: 'ChatGPT', of: 'Claude', text: 'setuju soal edge case, tapi minta jalur bahagia tetap terlihat.' },
    { from: 'DeepSeek', of: 'Claude', text: 'rollback masih abstrak; sarankan 1 langkah undo konkret.' },
    { from: 'Gemini', of: 'Claude', text: 'risiko lengkap, tapi bisa lebih singkat untuk eksekusi.' },
    { from: 'ChatGPT', of: 'DeepSeek', text: 'slice teknis bagus; tambahkan tujuan user di atas langkah.' },
    { from: 'Claude', of: 'DeepSeek', text: 'tegaskan ini masih draf instruksi, bukan penulisan file.' },
    { from: 'Gemini', of: 'DeepSeek', text: 'tambahkan bagaimana hasilnya dicek secara visual.' },
    { from: 'ChatGPT', of: 'Gemini', text: 'narasi jelas; pecah jadi langkah bernomor.' },
    { from: 'Claude', of: 'Gemini', text: 'contoh bagus; tandai data yang tidak boleh diunggah.' },
    { from: 'DeepSeek', of: 'Gemini', text: 'tambahkan kontrak data di samping cerita pengguna.' }
  ].filter((review) => names.has(review.of));
}

function relevantGroups(input) {
  const lower = input.toLowerCase();
  const groups = [];
  if (/snippet|inline|autocomplete|satu baris|potongan/.test(lower)) groups.push('inline_helper');
  if (/otonom|multi-file|banyak file|seluruh repo|devin/.test(lower)) groups.push('autonomous_agent');
  if (/refactor|edit|builder|ui|halaman|app|kode|code|implement|bangun/.test(lower)) groups.push('code_maker');
  if (!groups.length) groups.push('code_maker');
  return [...new Set(groups)];
}

function createCombinedDraft(input, project, proposals) {
  const names = proposals.map((item) => item.name).join(', ');
  return `Tujuan: ${input.trim()}\nProyek: ${project.name}\nSumber: ${names}\n\nKerjakan hanya setelah manusia menyetujui teks ini.\n1. Jangan ubah file sampai ada bridge coding agent yang nyata.\n2. Tetapkan slice terkecil yang bisa diuji minggu ini.\n3. Catat edge case: data kosong, user baru, gagal simpan.\n4. Siapkan langkah rollback / undo yang eksplisit.\n5. Laporkan status jujur: ini instruksi, bukan eksekusi.`;
}

function createGroupDrafts(input, project, proposals) {
  const groups = relevantGroups(input);
  const labels = {
    code_maker: 'Code Maker (Cursor, Windsurf)',
    autonomous_agent: 'Autonomous Agent (Devin)',
    inline_helper: 'Inline Helper (GitHub Copilot)'
  };
  return groups.map((id) => ({
    id,
    label: labels[id],
    text: `${labels[id]}\nProyek: ${project.name}\nDari: ${proposals.map((p) => p.name).join(', ')}\nTujuan: ${input.trim()}\nHanya instruksi — tidak ada eksekusi nyata.`
  }));
}

function splitTeamwork(instruction) {
  return {
    copilot: `GitHub Copilot (inline / potongan kecil)\n${instruction}\n\nFokus: snippet, autocomplete, perbaikan lokal. Perlu akun GitHub/Copilot sendiri.`,
    devin: `Devin AI (tugas multi-file otonom)\n${instruction}\n\nFokus: rencana kerja lintas file. Perlu akun Cognition/Devin sendiri.`,
    cursor: `Cursor (refactor interaktif)\n${instruction}\n\nFokus: suntingan bertahap dengan review manusia di editor.`,
    windsurf: `Windsurf (alur besar)\n${instruction}\n\nFokus: merangkai alur end-to-end setelah slice kecil disetujui.`
  };
}

function splitTeamworkByGroup(groupId, instruction) {
  const members = {
    code_maker: ['cursor', 'windsurf'],
    autonomous_agent: ['devin'],
    inline_helper: ['copilot']
  }[groupId] || [];
  const all = splitTeamwork(instruction);
  const out = {};
  for (const id of members) out[id] = all[id];
  return out;
}

function createAnalysisResponse(input, project, compact) {
  const hint = compactHint(compact);
  return `Mode Analysis/Security untuk <b>${project.name}</b> — diskusi saja, bukan scanner.${hint}<br>
<b>Temuan (contoh, SIMULASI):</b><br>
1. Input belum divalidasi di klien — keyakinan sedang. Periksa juga validasi server.<br>
2. Jangan simpan secret di frontend — keyakinan tinggi.<br>
3. Upload tanpa cek tipe bisa jadi path traversal — keyakinan sedang.<br>
Ini bukan pengganti pemindaian sungguhan. Untuk scan repo, pakai Aikido, DeepSource, atau CodeRabbit.<br>
<span class="privacy-note">Gemini tier gratis: data boleh dipakai Google. Jangan tempel secret.</span><br>
<span class="sim-badge">SIMULASI</span><span class="route-tag">Analysis · no file changes</span><br>
Permintaan: ${input.slice(0, 160)}`;
}

module.exports = {
  personalityStyle,
  createLearningResponse,
  createGhostResponse,
  createModelProposals,
  createCrossReviews,
  createCombinedDraft,
  createGroupDrafts,
  splitTeamwork,
  splitTeamworkByGroup,
  createAnalysisResponse
};
