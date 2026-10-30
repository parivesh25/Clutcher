import { api } from './api'
import { supabase } from './supabase'

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

type SkillProgressRow = {
  user_id: string
  skill_id: string
  state: 'base' | 'learned'
  source: 'profile_tag' | 'resume' | 'learning'
  learned_at: string | null
  position_x: number | null
  position_y: number | null
}

async function signedInUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Sign in to sync your skill graph.')
  return data.user.id
}

function toProgress(rows: SkillProgressRow[]): SkillProgress {
  return {
    base_skill_ids: rows.filter((row) => row.state === 'base').map((row) => row.skill_id),
    learned: rows
      .filter((row) => row.state === 'learned')
      .map((row) => ({ skill_id: row.skill_id, learned_at: row.learned_at })),
    resume_skill_ids: rows.filter((row) => row.source === 'resume').map((row) => row.skill_id),
    positions: Object.fromEntries(
      rows
        .filter((row) => row.position_x !== null && row.position_y !== null)
        .map((row) => [row.skill_id, { x: row.position_x!, y: row.position_y! }]),
    ),
  }
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
  return signedInUserId().then(async (userId) => {
    const { data, error } = await supabase
      .from('skill_progress')
      .select('user_id,skill_id,state,source,learned_at,position_x,position_y')
      .eq('user_id', userId)
      .order('skill_id')
    if (error) throw new Error('Could not load your saved skill graph.')
    return toProgress((data ?? []) as SkillProgressRow[])
  })
}

export async function saveSkillProgress(input: {
  base_skill_ids: string[]
  learned_skill_ids: string[]
  resume_skill_ids: string[]
  positions: Record<string, Position>
}): Promise<SkillProgress> {
  const userId = await signedInUserId()
  const { data: existingData, error: readError } = await supabase
    .from('skill_progress')
    .select('user_id,skill_id,state,source,learned_at,position_x,position_y')
    .eq('user_id', userId)
  if (readError) throw new Error('Could not sync your skill graph.')

  const existing = new Map(((existingData ?? []) as SkillProgressRow[]).map((row) => [row.skill_id, row]))
  const base = new Set(input.base_skill_ids)
  const learned = new Set(input.learned_skill_ids.filter((id) => !base.has(id)))
  const resume = new Set(input.resume_skill_ids)
  const skillIds = [...base, ...learned]
  const keep = new Set(skillIds)
  const removed = [...existing.keys()].filter((id) => !keep.has(id))

  if (removed.length) {
    const { error } = await supabase.from('skill_progress').delete().eq('user_id', userId).in('skill_id', removed)
    if (error) throw new Error('Could not sync your skill graph.')
  }

  const now = new Date().toISOString()
  const rows: SkillProgressRow[] = skillIds.map((skillId) => {
    const position = input.positions[skillId]
    const validPosition = position && [position.x, position.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    const isBase = base.has(skillId)
    return {
      user_id: userId,
      skill_id: skillId,
      state: isBase ? 'base' : 'learned',
      source: resume.has(skillId) ? 'resume' : isBase ? 'profile_tag' : 'learning',
      learned_at: isBase ? null : existing.get(skillId)?.learned_at ?? now,
      position_x: validPosition ? position.x : null,
      position_y: validPosition ? position.y : null,
    }
  })

  if (rows.length) {
    const { error } = await supabase.from('skill_progress').upsert(rows, { onConflict: 'user_id,skill_id' })
    if (error) throw new Error('Could not sync your skill graph.')
  }

  return getSkillProgress()
}
