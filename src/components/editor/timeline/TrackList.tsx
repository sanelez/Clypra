import React, { useState } from 'react'
import { Volume2, VolumeX, Lock, Unlock, X } from 'lucide-react'
import { useTimelineStore } from '../../../store/timelineStore'

interface TrackListProps {
  onEditTrack?: (trackId: string) => void
}

export const TrackList: React.FC<TrackListProps> = ({ onEditTrack }) => {
  const { tracks, removeTrack } = useTimelineStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleDoubleClick = (trackId: string, name: string) => {
    setEditingId(trackId)
    setEditingName(name)
  }

  const handleNameChange = (trackId: string, newName: string) => {
    setEditingId(null)
    onEditTrack?.(trackId)
  }

  return (
    <div className="w-44 bg-surface border-r border-border overflow-y-auto scrollbar-thin">
      {tracks.map((track) => (
        <div
          key={track.id}
          className="border-b border-border flex items-center gap-2 px-2 py-1"
          style={{ height: `${track.height}px` }}
        >
          {editingId === track.id ? (
            <input
              autoFocus
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => handleNameChange(track.id, editingName)}
              onKeyPress={(e) => e.key === 'Enter' && handleNameChange(track.id, editingName)}
              className="flex-1 bg-surface-raised border border-accent rounded px-1 py-0.5 text-xs text-text-primary focus:outline-none"
            />
          ) : (
            <div
              onDoubleClick={() => handleDoubleClick(track.id, track.name)}
              className="flex-1 text-xs font-medium text-text-primary truncate cursor-text hover:text-accent"
            >
              {track.name}
            </div>
          )}

          <button className="p-1 hover:bg-surface-raised rounded transition-colors">
            {track.muted ? (
              <VolumeX className="w-3 h-3 text-text-muted" />
            ) : (
              <Volume2 className="w-3 h-3 text-text-muted" />
            )}
          </button>

          <button className="p-1 hover:bg-surface-raised rounded transition-colors">
            {track.locked ? (
              <Lock className="w-3 h-3 text-text-muted" />
            ) : (
              <Unlock className="w-3 h-3 text-text-muted" />
            )}
          </button>

          <button
            onClick={() => removeTrack(track.id)}
            className="p-1 hover:bg-danger/20 rounded transition-colors opacity-0 hover:opacity-100"
          >
            <X className="w-3 h-3 text-danger" />
          </button>
        </div>
      ))}
    </div>
  )
}
