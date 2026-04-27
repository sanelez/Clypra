import React from 'react'

interface TimelineControlsProps {
  scrollLeft: number
  onScroll: (left: number) => void
  containerWidth: number
  contentWidth: number
}

export const TimelineControls: React.FC<TimelineControlsProps> = ({ scrollLeft, onScroll, containerWidth, contentWidth }) => {
  const handleScroll = (e: React.WheelEvent) => {
    const newLeft = Math.max(0, Math.min(scrollLeft + e.deltaX, contentWidth - containerWidth))
    onScroll(newLeft)
  }

  return (
    <div
      onWheel={handleScroll}
      className="relative overflow-x-auto scrollbar-thin flex-1"
      style={{ width: `${containerWidth}px` }}
    >
      <div style={{ width: `${contentWidth}px`, height: '100%' }} />
    </div>
  )
}
