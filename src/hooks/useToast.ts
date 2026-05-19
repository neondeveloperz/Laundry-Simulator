// Path: src/hooks/useToast.ts
import { useState, useCallback } from "react"
import type { Toast } from "@/types"

let nextId = 0

export function useToast(duration = 3500) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((type: Toast["type"], msg: string) => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, type, msg }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [duration])

  return { toasts, show }
}
