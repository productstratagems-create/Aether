export default function ArchetypeBanner({ archetype }) {
  if (!archetype) return null
  return (
    <div className="archetype-banner">
      <div className="archetype-header">
        <span className="archetype-name">{archetype.name}</span>
        <span className="archetype-sensation">{archetype.sensation}</span>
      </div>
      <p className="archetype-desc">{archetype.description}</p>
    </div>
  )
}
