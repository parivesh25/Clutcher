import { useEffect, useId, useRef, useState } from 'react'
import { getLearningRoadmap } from '../lib/matcher'
import type { MatchResult, RoadmapStep, StudentProfile } from '../lib/types'
import ErrorNote from './ErrorNote'
import Icon from './Icon'

type Props = { match: MatchResult; profile: StudentProfile; skillNames: Map<string, string> }

/** Expandable explanation backed by the matcher and, on request, the Gemini API. */
export default function OpportunityCopilot({ match, profile, skillNames }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState<RoadmapStep[] | null>(null)
  const [planSource, setPlanSource] = useState<'gemini' | 'basic' | 'no_gaps' | null>(null)
  const [error, setError] = useState('')
  const panelId = useId()
  const requestNo = useRef(0)
  const required = match.missing_required_skills
  const preferred = match.missing_preferred_skills
  const gaps = [...required, ...preferred]
  const listingHasSkills = match.opportunity.required_skill_ids.length + match.opportunity.preferred_skill_ids.length > 0

  useEffect(() => {
    requestNo.current += 1
    setSteps(null)
    setPlanSource(null)
    setError('')
    setBusy(false)
  }, [match, profile])

  async function generate() {
    const requestId = ++requestNo.current
    setBusy(true)
    setError('')
    try {
      const response = await getLearningRoadmap(match.opportunity.id, profile)
      if (requestId === requestNo.current) {
        setSteps(response.steps)
        setPlanSource(response.plan_source)
      }
    } catch (cause) {
      if (requestId === requestNo.current) setError((cause as Error).message)
    } finally {
      if (requestId === requestNo.current) setBusy(false)
    }
  }

  return (
    <div className="copilot">
      <button className="copilot-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={panelId}>
        <Icon name="spark" size={17} /> {open ? 'Close fit analysis' : 'Analyze fit and skill gaps'} <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="copilot-panel" id={panelId}>
          <h4>Skill gap analysis</h4>
          <p className="hint">Based on the skills named in this listing and your selected tags. Check the source for full requirements.</p>
          {!listingHasSkills ? (
            <p className="hint">This listing does not name any skills, so a skill gap cannot be assessed.</p>
          ) : gaps.length === 0 ? (
            <p className="copilot-good">You selected every skill this listing marks as required or preferred. Check eligibility and application details before applying.</p>
          ) : (
            <>
              {required.length > 0 && <p><strong>Required to build:</strong> {required.map((id) => skillNames.get(id) ?? id).join(', ')}</p>}
              {preferred.length > 0 && <p><strong>Nice to build:</strong> {preferred.map((id) => skillNames.get(id) ?? id).join(', ')}</p>}
              {!steps && <button type="button" className="primary roadmap-button" onClick={() => void generate()} disabled={busy}>
                <Icon name="spark" size={16} /> {busy ? 'Generating…' : 'Generate learning roadmap'}
              </button>}
              <ErrorNote message={error} />
              {steps && (
                <div className="roadmap">
                  <h4>{planSource === 'gemini' ? 'AI suggested practice' : 'Basic practice plan'}</h4>
                  <ol>
                    {steps.map((step) => <li key={step.skill_id}><strong>{step.skill_name}</strong><span>{step.action}</span></li>)}
                  </ol>
                  {gaps.length > steps.length && <p className="hint">Showing the first {steps.length} skill gaps. Recheck the full list above.</p>}
                  <p className="hint">{planSource === 'gemini' ? 'AI suggestions are a starting point.' : 'AI generation is unavailable for this project right now.'} Verify the plan against the listing.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
