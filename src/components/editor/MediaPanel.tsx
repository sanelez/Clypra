import React, { useState } from 'react'
import { CloudUpload, Music, Film, Image } from 'lucide-react'
// @ts-ignore - react-dnd types issue
import { useDrag } from 'react-dnd'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { ContextMenu } from '../ui/ContextMenu'
import { useMediaImport } from '../../hooks/useMediaImport'
import { useProjectStore } from '../../store/projectStore'

interface MediaPanelProps {
  onAddToTimeline?: (mediaId: string) => void
}

export const MediaPanel: React.FC<MediaPanelProps> = ({ onAddToTimeline }) => {
  const { mediaAssets, removeMediaAsset } = useProjectStore()
  const { importMedia, isLoading } = useMediaImport()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; mediaId: string } | null>(null)

  const getMediaIcon = (type: string) => {
    if (type === 'video') return <Film className="w-full h-full text-text-muted" />
    if (type === 'audio') return <Music className="w-full h-full text-text-muted" />
    return <Image className="w-full h-full text-text-muted" />
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  return (
    <div className="w-64 bg-surface border-r border-border flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border">
        <Button
          variant="secondary"
          size="sm"
          className="w-full border-dashed"
          icon={<CloudUpload className="w-4 h-4" />}
          onClick={importMedia}
          loading={isLoading}
        >
          Import Media
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {mediaAssets.length === 0 ? (
          <EmptyState
            icon={CloudUpload}
            title="No media imported"
            description="Import videos, audio, or images to get started"
          />
        ) : (
          <div className="grid grid-cols-2 gap-2 p-3">
            {mediaAssets.map((asset) => (
              <MediaCard
                key={asset.id}
                asset={asset}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, mediaId: asset.id })
                }}
                onAddToTimeline={() => onAddToTimeline?.(asset.id)}
              />
            ))}
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          items={[
            { label: 'Add to Timeline', onClick: () => onAddToTimeline?.(contextMenu.mediaId) },
            { label: 'Delete', onClick: () => removeMediaAsset(contextMenu.mediaId), danger: true },
          ]}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

interface MediaCardProps {
  asset: any
  onContextMenu: (e: React.MouseEvent) => void
  onAddToTimeline: () => void
}

const MediaCard: React.FC<MediaCardProps> = ({ asset, onContextMenu, onAddToTimeline }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'MEDIA_ASSET',
    item: { type: 'MEDIA_ASSET', asset },
    collect: (monitor: any) => ({
      isDragging: monitor.isDragging(),
    }),
  }))

  return (
    <div
      ref={drag}
      onContextMenu={onContextMenu}
      className={`relative bg-surface-raised rounded cursor-grab active:cursor-grabbing overflow-hidden ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="aspect-video bg-surface-raised flex items-center justify-center relative">
        {asset.posterFrame ? (
          <img src={asset.posterFrame} alt={asset.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-8 h-8">
            {asset.type === 'video' ? (
              <Film className="w-full h-full text-text-muted" />
            ) : asset.type === 'audio' ? (
              <Music className="w-full h-full text-text-muted" />
            ) : (
              <Image className="w-full h-full text-text-muted" />
            )}
          </div>
        )}
        {asset.duration > 0 && (
          <div className="absolute bottom-1 right-1 bg-black/70 px-1.5 py-0.5 rounded text-xs text-white">
            {Math.floor(asset.duration / 60)}:{String(Math.floor(asset.duration % 60)).padStart(2, '0')}
          </div>
        )}
      </div>
      <div className="p-1.5">
        <p className="text-xs font-medium text-text-primary truncate">{asset.name}</p>
      </div>
    </div>
  )
}
