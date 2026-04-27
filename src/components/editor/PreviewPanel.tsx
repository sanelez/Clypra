import React, { useRef, useEffect, useState } from 'react'
import { Volume2, VolumeX, SkipBack, ChevronLeft, Circle, ChevronRight, SkipForward } from 'lucide-react'
import { Button } from '../ui/Button'
import { usePlayback } from '../../hooks/usePlayback'
import { useProjectStore } from '../../store/projectStore'

export const PreviewPanel: React.FC = () => {
  const { isPlaying, currentTime, duration, frameRate, play, pause, seek, formatTime } = usePlayback()
  const { project } = useProjectStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(100)

  if (!project) return null

  const canvasWidth = project.canvasWidth
  const canvasHeight = project.canvasHeight

  const containerWidth = containerRef.current?.clientWidth || 600
  const containerHeight = containerRef.current?.clientHeight || 400

  const scale = Math.min(containerWidth / canvasWidth, containerHeight / canvasHeight)
  const displayWidth = canvasWidth * scale
  const displayHeight = canvasHeight * scale

  const handlePlayheadClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeX = e.clientX - rect.left
    const newTime = (relativeX / displayWidth) * duration
    seek(newTime)
  }

  return (
    <div className="flex-1 bg-surface flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div ref={containerRef} className="w-full h-full flex items-center justify-center">
          <div
            className="checkerboard rounded"
            style={{
              width: displayWidth,
              height: displayHeight,
            }}
          >
            <div className="w-full h-full bg-surface-raised flex items-center justify-center text-text-muted">
              Preview
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-accent">{project.aspectRatio}</span>
          <div className="text-sm text-text-primary">
            {Math.floor(displayWidth)}x{Math.floor(displayHeight)}
          </div>
        </div>

        <div
          className="h-8 bg-surface-raised rounded cursor-pointer relative border border-border"
          onClick={handlePlayheadClick}
        >
          <div
            className="absolute h-full bg-accent rounded opacity-30"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-center gap-2">
          <Button variant="ghost" size="sm" icon={<SkipBack className="w-4 h-4" />} />
          <Button variant="ghost" size="sm" icon={<ChevronLeft className="w-4 h-4" />} />
          <Button
            variant="secondary"
            size="sm"
            className="px-3"
            icon={
              isPlaying ? (
                <Circle className="w-5 h-5 fill-current" />
              ) : (
                <Circle className="w-5 h-5 fill-current" />
              )
            }
            onClick={isPlaying ? pause : play}
          />
          <Button variant="ghost" size="sm" icon={<ChevronRight className="w-4 h-4" />} />
          <Button variant="ghost" size="sm" icon={<SkipForward className="w-4 h-4" />} />

          <div className="w-px h-6 bg-border mx-2" />

          <Button
            variant="ghost"
            size="sm"
            icon={isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            onClick={() => setIsMuted(!isMuted)}
          />
          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value))
              if (Number(e.target.value) > 0) setIsMuted(false)
            }}
            className="w-24"
          />
        </div>
      </div>
    </div>
  )
}
