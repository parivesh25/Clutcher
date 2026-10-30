import { api } from './api'

export type Position = { x: number; y: number }

export type SkillKnowledgeNode = {
  id: string
  label: string
  category: string
  aliases: string[]
  description: string
  position: Position
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
  nodes: Array<SkillKnowledgeNode & {
    state: ProfileSkillState
    origins: Array<'profile_tag' | 'resume' | 'learning'>
  }>
  edges: Array<SkillKnowledgeEdge & { state: 'known' | 'growth' | 'context' }>
  next_skills: Array<{ id: string; label: string; readiness: number }>
  summary: { base_count: number; learned_count: number; suggested_count: number }
  unmatched_skills: string[]
}

export type SkillProgress = {
  base_skill_ids: string[]
  learned: Array<{ skill_id: string; learned_at: string | null }>
  resume_skill_ids: string[]
  positions: Record<string, Position>
}

export function getKnowledgeGraph(): Promise<SkillKnowledgeGraph> {
  return api('/knowledge-graph')
}

export function createProfileKnowledgeGraph(input: {
  current_skills: string[]
  learned_skills: string[]
  resume_text?: string
  expansion_depth?: number
}): Promise<ProfileKnowledgeGraph> {
  return api('/knowledge-graph/profile', { method: 'POST', body: input })
}

export function getSkillProgress(): Promise<SkillProgress> {
  return api('/knowledge-graph/progress')
}

export function saveSkillProgress(input: {
  base_skill_ids: string[]
  learned_skill_ids: string[]
  resume_skill_ids: string[]
  positions: Record<string, Position>
}): Promise<SkillProgress> {
  return api('/knowledge-graph/progress', { method: 'PUT', body: input })
}
