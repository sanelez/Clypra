import React, { useRef, useEffect } from 'react'
import { usePlaybackStore } from '../../../store/playbackStore'

interface PlayheadProps {
  pixelsPerSecond: number
  duration: number
  scrollLeft: number
  trackHeight: number
}

export const Playhead: React.FC<PlayheadProps> = ({ pixelsPerSecond, duration, scrollLeft, trackHeight }) => {
  const { currentTime, seek } = usePlaybackStore()
  const isDraggingRef = useRef(false)

  const left = currentTime * pixelsPerSecond - scrollLeft

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return

      const playheadElement = document.querySelector('[data-playhead]') as HTMLElement
      if (!playheadElement) return

      const parent = playheadElement.parentElement
      if (!parent) return

      const rect = parent.getBoundingClientRect()
      const x = e.clientX - rect.left + scrollLeft
      const newTime = Math.max(0, Math.min(x / pixelsPerSecond, duration))
      seek(newTime)
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
    }

    if (isDraggingRef.current) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)

      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [duration, pixelsPerSecond, scrollLeft, seek])

  return (
    <div
      data-playhead
      className="absolute z-40 pointer-events-none"
      style={{
        left: `${left}px`,
        top: 0,
        height: trackHeight,
        width: '2px',
        backgroundColor: '#ef4444',
      }}
    >
      <div
        className="absolute w-4 h-3 bg-danger rounded-sm pointer-events-auto cursor-grab active:cursor-grabbing"
        style={{
          left: '-8px',
          top: '-4px',
          clipPath: 'polygon(0 100%, 50% 0, 100% 100%)',
        }}
        onMouseDown={() => {
          isDraggingRef.current = true
        }}
      />
    </div>
  )
}
