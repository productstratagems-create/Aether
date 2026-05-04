import ArchetypeBanner from '../components/ArchetypeBanner.jsx'
import AetherScoreCard from '../components/AetherScoreCard.jsx'

export default function ScoreView({ kinetic, acoustic, atmospheric, archetype, onSave, history }) {
  return (
    <div className="view-enter" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem 1rem 1rem' }}>
      {archetype && <ArchetypeBanner archetype={archetype} />}
      <AetherScoreCard
        atmospheric={atmospheric}
        kinetic={kinetic}
        acoustic={acoustic}
        onSave={onSave}
        history={history}
      />
    </div>
  )
}
