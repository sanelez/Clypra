import React, { useState } from 'react'
// @ts-ignore - react-dnd types issue
import { useDrag } from 'react-dnd'
import { useUIStore } from '../../../store/uiStore'
import { useTimelineStore } from '../../../store/timelineStore'
import type { Clip as ClipType, MediaAsset } from '../../../types'

interface ClipProps {
  clip: ClipType
  mediaAsset?: MediaAsset
  pixelsPerSecond: number
  selected?: boolean
}

export const Clip: React.FC<ClipProps> = ({ clip, mediaAsset, pixelsPerSecond, selected }) => {
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null)
  const { selectClip } = useUIStore()
  const { updateClip, moveClip } = useTimelineStore()

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: 'CLIP',
      item: clip,
      collect: (monitor: any) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    []
  )

  const left = clip.startTime * pixelsPerSecond
  const width = clip.duration * pixelsPerSecond

  const handleResizeStart = (e: React.MouseEvent, side: 'left' | 'right') => {
    e.stopPropagation()
    setIsResizing(side)
  }

  const getClipColor = () => {
    if (mediaAsset?.type === 'video') return 'bg-video-clip'
    if (mediaAsset?.type === 'audio') return 'bg-audio-clip'
    return 'bg-text-clip'
  }

  return (
    <div
      ref={drag}
      onClick={() => selectClip(clip.id)}
      className={`absolute h-full cursor-grab active:cursor-grabbing rounded-sm overflow-hidden transition-colors ${
        selected ? 'ring-2 ring-accent' : ''
      } ${isDragging ? 'opacity-50' : ''} ${getClipColor()}`}
      style={{
        left: `${left}px`,
        width: `${width}px`,
      }}
    >
      {/* Left trim handle */}
      <div
        className="absolute left-0 w-1.5 h-full bg-surface-raised/40 cursor-ew-resize hover:bg-surface-raised/60"
        onMouseDown={(e) => handleResizeStart(e, 'left')}
      />

      {/* Clip content */}
      <div className="w-full h-full p-1.5 flex items-center gap-1 overflow-hidden">
        <div className="text-xs font-medium text-text-primary truncate">{mediaAsset?.name || 'Clip'}</div>
      </div>

      {/* Right trim handle */}
      <div
        className="absolute right-0 w-1.5 h-full bg-surface-raised/40 cursor-ew-resize hover:bg-surface-raised/60"
        onMouseDown={(e) => handleResizeStart(e, 'right')}
      />
    </div>
  )
}
