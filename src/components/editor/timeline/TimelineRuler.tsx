import React from 'react'
import { usePlayback } from '../../../hooks/usePlayback'

interface TimelineRulerProps {
  pixelsPerSecond: number
  scrollLeft: number
  onSeek: (time: number) => void
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({ pixelsPerSecond, scrollLeft, onSeek }) => {
  const { frameRate } = usePlayback()

  const getMarkerInterval = () => {
    if (pixelsPerSecond < 50) return 5
    if (pixelsPerSecond < 200) return 1
    if (pixelsPerSecond < 500) return 0.5
    return 10 / frameRate
  }

  const markerInterval = getMarkerInterval()
  const startTime = scrollLeft / pixelsPerSecond
  const visibleRange = 1000 / pixelsPerSecond
  const endTime = startTime + visibleRange

  const markers = []
  for (let time = Math.floor(startTime / markerInterval) * markerInterval; time < endTime; time += markerInterval) {
    markers.push(time)
  }

  const formatTime = (seconds: number) => {
    if (markerInterval >= 1) {
      return `${Math.floor(seconds)}s`
    }
    return `${seconds.toFixed(1)}s`
  }

  return (
    <div className="h-7 bg-surface-raised border-b border-border flex items-center px-2 cursor-pointer select-none">
      {markers.map((time) => {
        const x = (time - startTime) * pixelsPerSecond
        return (
          <div
            key={time}
            style={{
              position: 'absolute',
              left: `${x}px`,
              fontSize: '10px',
              color: '#666',
              userSelect: 'none',
            }}
            onClick={() => onSeek(time)}
          >
            {formatTime(time)}
          </div>
        )
      })}
    </div>
  )
}
