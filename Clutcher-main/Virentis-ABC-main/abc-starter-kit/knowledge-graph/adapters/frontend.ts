// Standalone contract and API client. This file is not imported by the current frontend.
export type SkillKnowledgeNode = {
  id: string
  label: string
  category: string
  aliases: string[]
  description: string
  position: { x: number; y: number }
}

export type SkillKnowledgeEdge = {
  source: string
  target: string
  relationship: string
  weight: number
}

export type SkillKnowledgeGraph = {
  schema_version: '1.0'
  graph_id: string
  title: string
  nodes: SkillKnowledgeNode[]
  edges: SkillKnowledgeEdge[]
}

export type RelatedSkill = {
  id: string
  label: string
  distance: number
  path: string[]
}

export type ProfileSkillState = 'base' | 'learned' | 'suggested'
export type ProfileKnowledgeGraph = {
  schema_version: '1.0'
  graph_id: string
  profile: {
    current_skill_ids: string[]
    resume_skill_ids: string[]
    base_skill_ids: string[]
    learned_skill_ids: string[]
  }
  nodes: Array<SkillKnowledgeNode & { state: ProfileSkillState; origins: Array<'profile_tag' | 'resume' | 'learning'> }>
  edges: Array<SkillKnowledgeEdge & { state: 'known' | 'growth' | 'context' }>
  next_skills: Array<{ id: string; label: string; readiness: number }>
  summary: { base_count: number; learned_count: number; suggested_count: number }
}

export async function getKnowledgeGraph(apiBase = ''): Promise<SkillKnowledgeGraph> {
  const response = await fetch(`${apiBase}/api/knowledge-graph`)
  if (!response.ok) throw new Error('Could not load the skill knowledge graph.')
  return response.json()
}

export async function getRelatedSkills(skill: string, limit = 6, apiBase = ''): Promise<RelatedSkill[]> {
  const query = new URLSearchParams({ skill, limit: String(limit) })
  const response = await fetch(`${apiBase}/api/knowledge-graph/related?${query}`)
  if (!response.ok) throw new Error('Could not load related skills.')
  const payload = await response.json()
  return payload.items
}

export async function createProfileKnowledgeGraph(
  input: { current_skills: string[]; learned_skills: string[]; resume_text?: string; expansion_depth?: number },
  apiBase = '',
): Promise<ProfileKnowledgeGraph> {
  const response = await fetch(`${apiBase}/api/knowledge-graph/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error('Could not build the profile knowledge graph.')
  return response.json()
}

