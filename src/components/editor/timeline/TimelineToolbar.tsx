import React, { useState } from 'react'
import { ZoomOut, ZoomIn, Film, Music, Type, Scissors, Magnet } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Tooltip } from '../../ui/Tooltip'
import { useTimelineStore } from '../../../store/timelineStore'

export const TimelineToolbar: React.FC = () => {
  const { zoomLevel, setZoom, addTrack } = useTimelineStore()
  const [snapMode, setSnapMode] = useState(true)
  const [splitMode, setSplitMode] = useState(false)

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setZoom(Number(e.target.value))
  }

  return (
    <div className="h-10 bg-surface-raised border-b border-border flex items-center px-3 gap-2">
      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <Tooltip content="Zoom out">
          <Button
            variant="ghost"
            size="sm"
            icon={<ZoomOut className="w-4 h-4" />}
            onClick={() => setZoom(Math.max(0.5, zoomLevel - 0.1))}
          />
        </Tooltip>

        <input
          type="range"
          min="0.5"
          max="5"
          step="0.1"
          value={zoomLevel}
          onChange={handleZoomChange}
          className="w-32"
        />

        <Tooltip content="Zoom in">
          <Button
            variant="ghost"
            size="sm"
            icon={<ZoomIn className="w-4 h-4" />}
            onClick={() => setZoom(Math.min(5, zoomLevel + 0.1))}
          />
        </Tooltip>

        <span className="text-xs text-text-muted ml-1">{zoomLevel.toFixed(1)}x</span>
      </div>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Track Add Buttons */}
      <div className="flex items-center gap-1">
        <Tooltip content="Add Video Track">
          <Button
            variant="ghost"
            size="sm"
            icon={<Film className="w-4 h-4" />}
            onClick={() => addTrack('video')}
          />
        </Tooltip>

        <Tooltip content="Add Audio Track">
          <Button
            variant="ghost"
            size="sm"
            icon={<Music className="w-4 h-4" />}
            onClick={() => addTrack('audio')}
          />
        </Tooltip>

        <Tooltip content="Add Text Track">
          <Button
            variant="ghost"
            size="sm"
            icon={<Type className="w-4 h-4" />}
            onClick={() => addTrack('text')}
          />
        </Tooltip>
      </div>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Mode Toggles */}
      <div className="flex items-center gap-1 ml-auto">
        <Tooltip content="Split mode">
          <Button
            variant={splitMode ? 'primary' : 'ghost'}
            size="sm"
            icon={<Scissors className="w-4 h-4" />}
            onClick={() => setSplitMode(!splitMode)}
          />
        </Tooltip>

        <Tooltip content="Snap to grid">
          <Button
            variant={snapMode ? 'primary' : 'ghost'}
            size="sm"
            icon={<Magnet className="w-4 h-4" />}
            onClick={() => setSnapMode(!snapMode)}
          />
        </Tooltip>
      </div>
    </div>
  )
}
