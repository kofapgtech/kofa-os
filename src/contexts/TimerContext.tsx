import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { TIME_DEPENDENT_KEYS } from '@/lib/queries'
import type { TimeEntry } from '@/lib/types'
import { useAuth } from './AuthContext'

interface TimerContextValue {
  running: TimeEntry | null
  /** Seconds elapsed on the running entry, ticking once per second. */
  elapsedSeconds: number
  start: (projectId: string, taskId: string | null, description?: string) => Promise<void>
  stop: () => Promise<void>
  busy: boolean
}

const TimerContext = createContext<TimerContextValue | undefined>(undefined)

export function TimerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [running, setRunning] = useState<TimeEntry | null>(null)
  const [elapsedSeconds, setElapsed] = useState(0)
  const [busy, setBusy] = useState(false)

  // A running entry is simply one with no ended_at, so it survives a reload.
  const loadRunning = useCallback(async () => {
    if (!user) {
      setRunning(null)
      return
    }
    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .maybeSingle()
    setRunning((data as TimeEntry) ?? null)
  }, [user])

  useEffect(() => {
    void loadRunning()
  }, [loadRunning])

  useEffect(() => {
    if (!running) {
      setElapsed(0)
      return
    }
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(running.started_at).getTime()) / 1000)))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [running])

  async function start(projectId: string, taskId: string | null, description?: string) {
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('start_timer', {
        p_project_id: projectId,
        p_task_id: taskId,
        p_description: description ?? null,
      })
      if (error) throw new Error(error.message)
      setRunning(data as TimeEntry)
      TIME_DEPENDENT_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: key }))
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setBusy(true)
    try {
      const { error } = await supabase.rpc('stop_timer')
      if (error) throw new Error(error.message)
      setRunning(null)
      TIME_DEPENDENT_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: key }))
      qc.invalidateQueries({ queryKey: ['task-hours'] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TimerContext.Provider value={{ running, elapsedSeconds, start, stop, busy }}>
      {children}
    </TimerContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTimer() {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useTimer must be used within a TimerProvider')
  return ctx
}
