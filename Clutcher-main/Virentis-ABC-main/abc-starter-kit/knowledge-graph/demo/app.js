const SVG_NS = 'http://www.w3.org/2000/svg'
const STORAGE_KEY = 'ps61-personal-knowledge-graph-v2'
const graphSvg = document.querySelector('#graph')
const tooltip = document.querySelector('#tooltip')
const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

let catalog
let profileGraph = null
let selectedId = null
let hoverId = null
let drag = null
let angle = 0
let lastFrame = performance.now()
let noticeTimer
let state = {
  currentSkillIds: [],
  learnedSkillIds: [],
  resumeText: '',
  positions: {},
  spinEnabled: !prefersReducedMotion,
}

function clone(value) { return JSON.parse(JSON.stringify(value)) }
function nodeById(id) { return profileGraph?.nodes.find((node) => node.id === id) }
function catalogNode(id) { return catalog.nodes.find((node) => node.id === id) }
function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
  return element
}
function message(text) {
  const element = document.querySelector('#message')
  element.textContent = text
  element.classList.add('show')
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => element.classList.remove('show'), 2200)
}
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
function graphPoint(event) {
  const point = graphSvg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  return point.matrixTransform(graphSvg.getScreenCTM().inverse())
}
function rotate(point, radians) {
  const cx = .5, cy = .5
  const x = point.x - cx, y = point.y - cy
  return { x: cx + x * Math.cos(radians) - y * Math.sin(radians), y: cy + x * Math.sin(radians) + y * Math.cos(radians) }
}
function displayedPoint(node) {
  const saved = state.positions[node.id]
  return rotate(saved ? { x: saved[0], y: saved[1] } : node.position, angle)
}
function unrotateScreenPoint(point) {
  return rotate({ x: point.x / 1000, y: point.y / 650 }, -angle)
}
function edgeKey(edge) { return [edge.source, edge.target].sort().join('|') + '|' + edge.relationship }

function createDefs() {
  const defs = svgElement('defs')
  const filter = svgElement('filter', { id: 'learned-glow', x: '-100%', y: '-100%', width: '300%', height: '300%' })
  const blur = svgElement('feGaussianBlur', { stdDeviation: '5', result: 'blur' })
  const merge = svgElement('feMerge')
  merge.append(svgElement('feMergeNode', { in: 'blur' }), svgElement('feMergeNode', { in: 'SourceGraphic' }))
  filter.append(blur, merge)
  defs.append(filter)
  graphSvg.append(defs)
}

function render() {
  graphSvg.replaceChildren()
  createDefs()
  graphSvg.append(
    svgElement('ellipse', { cx: 500, cy: 325, rx: 360, ry: 210, class: 'orbit-ring' }),
    svgElement('ellipse', { cx: 500, cy: 325, rx: 235, ry: 135, class: 'orbit-ring' }),
  )
  if (!profileGraph?.nodes.length) {
    const title = svgElement('text', { x: 500, y: 305, fill: '#eef2ff', 'text-anchor': 'middle', 'font-size': 23, 'font-weight': 750 })
    title.textContent = 'Choose current skills or add resume text'
    const sub = svgElement('text', { x: 500, y: 340, fill: '#8997be', 'text-anchor': 'middle', 'font-size': 13 })
    sub.textContent = 'Your personal knowledge graph will grow from that base.'
    graphSvg.append(title, sub)
    renderSummary()
    return
  }
  for (const edge of profileGraph.edges) {
    graphSvg.append(svgElement('line', {
      class: `edge ${edge.state}`,
      'data-edge': edgeKey(edge),
      'data-source': edge.source,
      'data-target': edge.target,
    }))
  }
  for (const node of profileGraph.nodes) {
    const group = svgElement('g', {
      class: `node state-${node.state}${node.id === selectedId ? ' selected' : ''}`,
      tabindex: '0',
      role: 'button',
      'data-node': node.id,
      'data-search': [node.id, node.label, node.category, ...node.aliases].join(' ').toLowerCase(),
      'aria-label': `${node.label}, ${node.state} skill. Select or drag.`,
    })
    group.append(
      svgElement('circle', { r: node.state === 'suggested' ? 17 : 20, class: 'halo' }),
      svgElement('circle', { r: node.state === 'suggested' ? 10 : 12, class: 'core' }),
    )
    const label = svgElement('text', { y: -25, 'text-anchor': 'middle', class: 'node-label' })
    label.textContent = node.label
    const stateLabel = svgElement('text', { y: 27, 'text-anchor': 'middle', class: 'state-label' })
    stateLabel.textContent = node.state === 'learned' ? 'NEW' : node.state.toUpperCase()
    group.append(label, stateLabel)
    group.addEventListener('mouseenter', (event) => showHover(node.id, event))
    group.addEventListener('mousemove', moveTooltip)
    group.addEventListener('mouseleave', hideHover)
    group.addEventListener('focus', (event) => showHover(node.id, event))
    group.addEventListener('blur', hideHover)
    group.addEventListener('click', () => { if (!drag?.moved) selectNode(node.id) })
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(node.id) }
    })
    group.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      drag = { id: node.id, start: graphPoint(event), moved: false }
    })
    graphSvg.append(group)
  }
  updateGeometry()
  applySearch()
  applyFocus()
  renderSummary()
}

function updateGeometry() {
  if (!profileGraph) return
  for (const edge of profileGraph.edges) {
    const source = nodeById(edge.source), target = nodeById(edge.target)
    if (!source || !target) continue
    const a = displayedPoint(source), b = displayedPoint(target)
    const line = graphSvg.querySelector(`[data-edge="${edgeKey(edge)}"]`)
    if (line) {
      line.setAttribute('x1', a.x * 1000); line.setAttribute('y1', a.y * 650)
      line.setAttribute('x2', b.x * 1000); line.setAttribute('y2', b.y * 650)
    }
  }
  for (const node of profileGraph.nodes) {
    const point = displayedPoint(node)
    const depthScale = .9 + .16 * Math.max(0, Math.min(1, point.y))
    const group = graphSvg.querySelector(`[data-node="${node.id}"]`)
    if (group) group.setAttribute('transform', `translate(${point.x * 1000} ${point.y * 650}) scale(${depthScale})`)
  }
}

function applySearch() {
  const query = document.querySelector('#search').value.trim().toLowerCase()
  for (const node of graphSvg.querySelectorAll('[data-node]')) {
    node.classList.toggle('search-dim', Boolean(query) && !node.dataset.search.includes(query))
  }
}

function applyFocus() {
  const focusId = hoverId || selectedId
  const adjacent = new Set([focusId])
  if (focusId) for (const edge of profileGraph?.edges || []) {
    if (edge.source === focusId) adjacent.add(edge.target)
    if (edge.target === focusId) adjacent.add(edge.source)
  }
  for (const node of graphSvg.querySelectorAll('[data-node]')) {
    node.classList.toggle('focus-dim', Boolean(focusId) && !adjacent.has(node.dataset.node))
  }
  for (const edge of graphSvg.querySelectorAll('[data-edge]')) {
    const focused = Boolean(focusId) && (edge.dataset.source === focusId || edge.dataset.target === focusId)
    edge.classList.toggle('focused', focused)
    edge.classList.toggle('dim', Boolean(focusId) && !focused)
  }
}

function showHover(id, event) {
  hoverId = id
  const node = nodeById(id)
  tooltip.replaceChildren()
  const title = document.createElement('b')
  title.textContent = node.label
  tooltip.append(title, node.description)
  tooltip.classList.add('show')
  moveTooltip(event)
  applyFocus()
}
function moveTooltip(event) {
  const stage = document.querySelector('.graph-stage').getBoundingClientRect()
  if (!Number.isFinite(event.clientX)) return
  tooltip.style.left = `${Math.min(stage.width - 260, Math.max(0, event.clientX - stage.left))}px`
  tooltip.style.top = `${Math.min(stage.height - 90, Math.max(0, event.clientY - stage.top))}px`
}
function hideHover() {
  hoverId = null
  tooltip.classList.remove('show')
  applyFocus()
}

function populateTags() {
  const container = document.querySelector('#skill-tags')
  container.replaceChildren()
  const resumeIds = new Set(profileGraph?.profile.resume_skill_ids || [])
  for (const node of [...catalog.nodes].sort((a, b) => a.label.localeCompare(b.label))) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `skill-tag${resumeIds.has(node.id) ? ' resume' : ''}`
    button.textContent = node.label
    button.setAttribute('aria-pressed', String(state.currentSkillIds.includes(node.id)))
    button.title = resumeIds.has(node.id) ? 'Also detected in resume text' : ''
    button.addEventListener('click', async () => {
      state.currentSkillIds = state.currentSkillIds.includes(node.id)
        ? state.currentSkillIds.filter((id) => id !== node.id)
        : [...state.currentSkillIds, node.id]
      state.learnedSkillIds = state.learnedSkillIds.filter((id) => id !== node.id)
      persist()
      await buildProfileGraph()
    })
    container.append(button)
  }
}

function selectNode(id) {
  selectedId = id
  const node = nodeById(id)
  if (!node) return
  document.querySelector('#empty-detail').hidden = true
  document.querySelector('#selected-detail').hidden = false
  document.querySelector('#detail-label').textContent = node.label
  document.querySelector('#detail-state').textContent = node.state === 'base' ? 'Base skill' : node.state === 'learned' ? 'Newly learned' : 'Suggested'
  document.querySelector('#detail-state').className = `state-pill ${node.state}`
  document.querySelector('#detail-description').textContent = node.description
  document.querySelector('#detail-category').textContent = node.category
  document.querySelector('#detail-origin').textContent = node.origins.length
    ? node.origins.map((origin) => origin.replace('_', ' ')).join(', ')
    : 'Connected suggestion'
  const button = document.querySelector('#learn-skill')
  if (node.state === 'base') {
    button.textContent = 'Included in base profile'
    button.disabled = true
  } else if (node.state === 'learned') {
    button.textContent = 'Undo learned'
    button.disabled = false
  } else {
    button.textContent = 'Mark as learned'
    button.disabled = false
  }
  for (const group of graphSvg.querySelectorAll('.node')) group.classList.toggle('selected', group.dataset.node === id)
  applyFocus()
}

function renderSummary() {
  const summary = profileGraph?.summary || { base_count: 0, learned_count: 0, suggested_count: 0 }
  document.querySelector('#base-count').textContent = summary.base_count
  document.querySelector('#learned-count').textContent = summary.learned_count
  document.querySelector('#suggested-count').textContent = summary.suggested_count
  document.querySelector('#counts').textContent = profileGraph
    ? `${profileGraph.nodes.length} visible skills · ${profileGraph.edges.length} relationships`
    : 'No profile graph yet'
  const next = document.querySelector('#next-skills')
  next.replaceChildren()
  for (const skill of (profileGraph?.next_skills || []).slice(0, 6)) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = `${skill.label} · ${Math.round(skill.readiness * 100)}% related`
    button.addEventListener('click', () => selectNode(skill.id))
    item.append(button)
    next.append(item)
  }
  const resumeNames = (profileGraph?.profile.resume_skill_ids || []).map((id) => catalogNode(id)?.label || id)
  document.querySelector('#resume-matches').textContent = resumeNames.length ? `Detected from resume: ${resumeNames.join(', ')}` : ''
}

async function buildProfileGraph() {
  const response = await fetch('/api/knowledge-graph/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_skills: state.currentSkillIds,
      learned_skills: state.learnedSkillIds,
      resume_text: state.resumeText,
      expansion_depth: 1,
    }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Could not build the profile graph.')
  profileGraph = payload
  if (selectedId && !nodeById(selectedId)) selectedId = null
  populateTags()
  render()
  if (selectedId) selectNode(selectedId)
  persist()
}

document.querySelector('#build-profile').addEventListener('click', async () => {
  state.resumeText = document.querySelector('#resume-text').value
  try { await buildProfileGraph(); message('Personal graph rebuilt') }
  catch (error) { message(error.message) }
})
document.querySelector('#resume-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  if (!['text/plain', 'text/markdown', 'application/rtf', 'text/rtf', ''].includes(file.type)) {
    event.target.value = ''
    return message('Use a TXT, MD or RTF resume in the local demo')
  }
  state.resumeText = await file.text()
  document.querySelector('#resume-text').value = state.resumeText
  try { await buildProfileGraph(); message('Resume skills added to the base graph') }
  catch (error) { message(error.message) }
})
document.querySelector('#learn-skill').addEventListener('click', async () => {
  const node = nodeById(selectedId)
  if (!node || node.state === 'base') return
  state.learnedSkillIds = node.state === 'learned'
    ? state.learnedSkillIds.filter((id) => id !== node.id)
    : [...new Set([...state.learnedSkillIds, node.id])]
  try {
    await buildProfileGraph()
    selectNode(node.id)
    message(node.state === 'learned' ? 'Learning status removed' : 'Skill learned — graph expanded')
  } catch (error) { message(error.message) }
})
document.querySelector('#search').addEventListener('input', applySearch)
document.querySelector('#spin').addEventListener('click', () => {
  state.spinEnabled = !state.spinEnabled
  document.querySelector('#spin').setAttribute('aria-pressed', String(state.spinEnabled))
  document.querySelector('#spin').textContent = state.spinEnabled ? 'Pause orbit' : 'Start orbit'
  persist()
})
document.querySelector('#reset').addEventListener('click', async () => {
  state = { currentSkillIds: [], learnedSkillIds: [], resumeText: '', positions: {}, spinEnabled: !prefersReducedMotion }
  selectedId = null
  angle = 0
  document.querySelector('#resume-text').value = ''
  document.querySelector('#resume-file').value = ''
  document.querySelector('#empty-detail').hidden = false
  document.querySelector('#selected-detail').hidden = true
  localStorage.removeItem(STORAGE_KEY)
  await buildProfileGraph()
  message('Profile graph reset')
})
document.querySelector('#export').addEventListener('click', () => {
  if (!profileGraph) return message('Build a profile graph first')
  const exportGraph = clone(profileGraph)
  for (const node of exportGraph.nodes) {
    const saved = state.positions[node.id]
    if (saved) node.position = { x: saved[0], y: saved[1] }
  }
  const blob = new Blob([JSON.stringify(exportGraph, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'personal-skill-graph.json'
  link.click()
  URL.revokeObjectURL(url)
  message('Personal graph exported')
})
window.addEventListener('pointermove', (event) => {
  if (!drag) return
  const point = graphPoint(event)
  if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 4) drag.moved = true
  if (!drag.moved) return
  const normalized = unrotateScreenPoint(point)
  state.positions[drag.id] = [
    Math.max(.03, Math.min(.97, normalized.x)),
    Math.max(.05, Math.min(.95, normalized.y)),
  ]
  updateGeometry()
})
window.addEventListener('pointerup', () => {
  if (!drag) return
  if (drag.moved) { persist(); selectNode(drag.id); message('Position saved locally') }
  setTimeout(() => { drag = null }, 0)
})

function animate(now) {
  const elapsed = Math.min(50, now - lastFrame)
  lastFrame = now
  if (state.spinEnabled && !hoverId && !drag && profileGraph?.nodes.length) {
    angle = (angle + elapsed * .00011) % (Math.PI * 2)
    updateGeometry()
  }
  requestAnimationFrame(animate)
}

try {
  catalog = await fetch('/api/knowledge-graph').then((response) => {
    if (!response.ok) throw new Error('Knowledge graph API unavailable.')
    return response.json()
  })
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) state = { ...state, ...JSON.parse(saved) }
  document.querySelector('#resume-text').value = state.resumeText
  document.querySelector('#spin').setAttribute('aria-pressed', String(state.spinEnabled))
  document.querySelector('#spin').textContent = state.spinEnabled ? 'Pause orbit' : 'Start orbit'
  await buildProfileGraph()
  requestAnimationFrame(animate)
} catch (error) {
  message(error.message)
}

