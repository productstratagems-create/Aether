import { useState, useCallback } from 'react'
import { HISTORY_KEY } from '../utils/constants.js'

export function useLocationHistory() {
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') }
    catch { return [] }
  })

  const save = useCallback(entry => {
    setHistory(prev => {
      const next = [entry, ...prev].slice(0, 100)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }, [])

  const remove = useCallback(id => {
    setHistory(prev => {
      const next = prev.filter(e => e.id !== id)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* */ }
      return next
    })
  }, [])

  const clear = useCallback(() => {
    try { localStorage.removeItem(HISTORY_KEY) } catch { /* */ }
    setHistory([])
  }, [])

  return { history, save, remove, clear }
}
