const { z } = require('zod');
const catalog = require('../catalog');

const knownIds = new Set([
  ...catalog.DIRECT_MODELS.map((m) => m.id),
  ...catalog.allRoleModels().map((m) => m.id),
  ...catalog.CODING_AGENTS.map((a) => a.id),
  'teamwork'
]);

const modelId = z.string().trim().min(1).max(80).refine((id) => knownIds.has(id), 'Unknown model');
const chatModelId = z.string().trim().min(1).max(80).refine((id) => {
  const found = catalog.findModel(id);
  return found && found.kind === 'chat';
}, 'Not a chat model');

const modes = z.enum(['learning', 'builder', 'combination', 'ghost', 'auto', 'analysis']);

const idToken = z.object({ credential: z.string().min(20).max(8000) });
const chatBody = z.object({
  input: z.string().trim().min(1).max(12000),
  mode: modes,
  models: z.array(chatModelId).min(1).max(4),
  conversationId: z.number().int().positive().optional(),
  fileIds: z.array(z.number().int().positive()).max(8).optional(),
  projectId: z.string().max(80).optional()
});
const settingsBody = z.object({
  theme: z.enum(['dark', 'light']).optional(),
  reply_mode: z.enum(['text', 'voice', 'both']).optional(),
  voice_enabled: z.boolean().optional(),
  active_model: z.string().max(400).optional(),
  active_models: z.array(modelId).min(1).max(16).optional(),
  master_power: z.boolean().optional(),
  personality_preset: z.enum(['formal', 'santai', 'tegas', 'hangat']).optional(),
  voice_pitch: z.number().min(0.5).max(1.4).optional(),
  voice_rate: z.number().min(0.5).max(1.4).optional(),
  auto_submit_voice: z.boolean().optional(),
  layout_mode: z.enum(['home', 'chat']).optional(),
  cube_visible: z.boolean().optional(),
  role_pools: z.record(z.string(), z.array(z.string().max(80)).max(12)).optional(),
  active_agents: z.array(z.enum(['cursor', 'windsurf', 'copilot', 'devin'])).max(4).optional()
});
const keysBody = z.object({
  chatgpt: z.string().max(400).optional(),
  claude: z.string().max(400).optional(),
  deepseek: z.string().max(400).optional(),
  gemini: z.string().max(400).optional(),
  github_models: z.string().max(400).optional(),
  openrouter: z.string().max(400).optional()
});
const projectBody = z.object({
  name: z.string().trim().min(1).max(80),
  mode: modes.optional()
});
const taskBody = z.object({
  text: z.string().trim().min(1).max(240),
  tag: z.string().max(24).optional(),
  done: z.boolean().optional(),
  id: z.number().int().positive().optional(),
  project_id: z.string().max(80).optional()
});
const memoryBody = z.object({
  body: z.string().trim().min(1).max(2000),
  project_id: z.string().max(80).optional(),
  tag: z.enum(['general', 'habit', 'insight']).optional()
});
const fileTagBody = z.object({ tag: z.enum(['important', 'project', 'work', 'school']) });
const approvalBody = z.object({
  target_agent: z.enum(['cursor', 'windsurf', 'copilot', 'devin', 'teamwork']),
  instruction: z.string().trim().min(1).max(20000),
  conversationId: z.number().int().positive().optional()
});
const feedbackBody = z.object({
  messageId: z.number().int().positive(),
  rating: z.enum(['up', 'down'])
});
const conversationPatch = z.object({
  title: z.string().trim().min(1).max(120).optional()
});
const profileBody = z.object({
  display_name: z.string().trim().min(1).max(80)
});
const insightsBody = z.object({
  model: z.string().max(80).optional()
});

function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const err = new Error('Invalid input');
    err.status = 400;
    err.details = result.error.issues.map((issue) => issue.path.join('.') + ' ' + issue.message);
    throw err;
  }
  return result.data;
}

module.exports = {
  parse, idToken, chatBody, settingsBody, keysBody, projectBody, taskBody,
  memoryBody, fileTagBody, approvalBody, feedbackBody, conversationPatch, profileBody, insightsBody
};
