export default function TabBar({ active, onChange, badges }) {
  const tabs = [
    { id: 'scan',  icon: '📡', label: 'Scan' },
    { id: 'score', icon: '◎',  label: 'Score' },
    { id: 'map',   icon: '📍',  label: 'Map' },
    { id: 'log',   icon: '☰',  label: 'Log' },
  ]

  return (
    <nav className="tab-bar" role="tablist">
      {tabs.map(({ id, icon, label }) => {
        const badge = badges?.[id]
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active === id}
            className={`tab-btn${active === id ? ' active' : ''}`}
            onClick={() => onChange(id)}
          >
            <span className="tab-btn-icon">{icon}</span>
            <span className="tab-btn-label">{label}</span>
            {badge != null && (
              <span className={`tab-badge${badge === 'pulse' ? ' tab-badge--pulse' : ''}`}>
                {badge === 'pulse' ? '' : badge}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
