import { ReactNode } from 'react'
import Icon, { IconName } from './Icon'

export type View = 'home' | 'discover' | 'profile'

const NAV: [View, string, IconName][] = [
  ['home', 'Home', 'home'],
  ['discover', 'Discover', 'compass'],
  ['profile', 'Profile', 'user'],
]

type Props = {
  view: View
  email: string | null
  matchCount: number | null
  matching: boolean
  canMatch: boolean
  onMatch: () => void
  onSignOut: () => void
  children: ReactNode
}

/** Sidebar on wide screens, floating tab bar with a central match button on phones. */
export default function AppShell({ view, email, matchCount, matching, canMatch, onMatch, onSignOut, children }: Props) {
  return (
    <div className="app">
      <aside className="sidebar" aria-label="Main">
        <div className="brand"><span className="brand-mark"><Icon name="spark" size={18} /></span>Opportunity Matcher</div>
        <nav className="nav" aria-label="Sections">
          {NAV.map(([v, label, icon]) => (
            <a key={v} href={`#${v}`} aria-current={view === v ? 'page' : undefined}>
              <Icon name={icon} />
              {label}
              {v === 'discover' && matchCount !== null && <span className="count">{matchCount}</span>}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          {email && <span className="email">{email}</span>}
          <button type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>

      <main className="main" id="main">{children}</main>

      <nav className="tabbar glass" aria-label="Sections">
        <a href="#home" aria-current={view === 'home' ? 'page' : undefined}><Icon name="home" />Home</a>
        <a href="#discover" aria-current={view === 'discover' ? 'page' : undefined}><Icon name="compass" />Discover</a>
        <button type="button" className="fab" onClick={onMatch} disabled={matching || !canMatch} aria-label={matching ? 'Finding matches' : 'Find matches'}>
          <Icon name="search" size={22} />
        </button>
        <a href="#profile" aria-current={view === 'profile' ? 'page' : undefined}><Icon name="user" />Profile</a>
        <button type="button" className="tab" onClick={onSignOut}><Icon name="logout" />Sign out</button>
      </nav>
    </div>
  )
}
