import KineticCard from '../components/KineticCard.jsx'
import AcousticCard from '../components/AcousticCard.jsx'
import AtmosphericCard from '../components/AtmosphericCard.jsx'
import MagnetometerCard from '../components/MagnetometerCard.jsx'

export default function ScanView({ kinetic, acoustic, atmospheric, atmosphericTier, magnetometer }) {
  return (
    <div className="view-enter" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem 1rem 1rem' }}>
      <MagnetometerCard sensor={magnetometer} />
      <KineticCard sensor={kinetic} />
      <AcousticCard sensor={acoustic} />
      <AtmosphericCard sensor={atmospheric} tier={atmosphericTier} />
    </div>
  )
}
