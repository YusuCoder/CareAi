import { useEffect, useRef, useState } from 'react'

export type StoryStage =
  | 'hospital'
  | 'discharge'
  | 'handoff'
  | 'home'
  | 'monitoring'
  | 'risk'
  | 'alert'
  | 'complete'

interface Beat {
  stage: StoryStage
  ms: number
}

const SEQUENCE: readonly Beat[] = [
  { stage: 'hospital', ms: 4000 },
  { stage: 'discharge', ms: 2600 },
  { stage: 'handoff', ms: 3400 },
  { stage: 'home', ms: 3800 },
  { stage: 'monitoring', ms: 3200 },
  { stage: 'risk', ms: 2600 },
  { stage: 'alert', ms: 3400 },
  { stage: 'complete', ms: 3500 },
]

export const NODES_VISIBLE: Record<StoryStage, number> = {
  hospital: 2,
  discharge: 3,
  handoff: 4,
  home: 5,
  monitoring: 5,
  risk: 6,
  alert: 7,
  complete: 7,
}

const DATA_BEATS: ReadonlySet<StoryStage> = new Set<StoryStage>(['home', 'alert'])

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}

interface Story {
  stage: StoryStage
  leaving: StoryStage | null
  pulse: number
  animated: boolean
}

export function useStorySequence(): Story {
  const reduced = usePrefersReducedMotion()
  const [index, setIndex] = useState<number>(0)
  const [leaving, setLeaving] = useState<StoryStage | null>(null)
  const [pulse, setPulse] = useState<number>(0)
  const previous = useRef<StoryStage>(SEQUENCE[0].stage)

  const stage = reduced ? 'complete' : SEQUENCE[index].stage

  useEffect(() => {
    if (reduced) return
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % SEQUENCE.length),
      SEQUENCE[index].ms,
    )
    return () => window.clearTimeout(timer)
  }, [index, reduced])

  useEffect(() => {
    if (reduced || previous.current === stage) return
    setLeaving(previous.current)
    previous.current = stage
    if (DATA_BEATS.has(stage)) setPulse((n) => n + 1)

    const timer = window.setTimeout(() => setLeaving(null), 460)
    return () => window.clearTimeout(timer)
  }, [stage, reduced])

  return { stage, leaving, pulse, animated: !reduced }
}
