import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { useProjectStore } from '../store/projectStore'
import type { MediaAsset, VideoMetadata } from '../types'

export const useMediaImport = () => {
  const [isLoading, setIsLoading] = useState(false)
  const { addMediaAsset } = useProjectStore()

  const importMedia = async () => {
    try {
      setIsLoading(true)
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'Media',
            extensions: ['mp4', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'aac', 'jpg', 'png', 'webp'],
          },
        ],
      })

      if (!selected) return

      const files = Array.isArray(selected) ? selected : [selected]

      for (const path of files) {
        const filename = path.split('/').pop() || 'Unknown'
        const type = getMediaType(path)

        if (type === 'video' || type === 'audio') {
          const metadata: VideoMetadata = await invoke('get_video_metadata', { path })
          const posterFrame: string | undefined = type === 'video'
            ? (await invoke('extract_poster_frame', { path, time: 0.0 }).catch(() => undefined)) as string | undefined
            : undefined

          const asset: MediaAsset = {
            id: `asset-${Date.now()}-${Math.random()}`,
            name: filename,
            path,
            type,
            duration: metadata.duration,
            width: metadata.width,
            height: metadata.height,
            posterFrame,
            size: metadata.size,
          }
          addMediaAsset(asset)
        } else {
          const asset: MediaAsset = {
            id: `asset-${Date.now()}-${Math.random()}`,
            name: filename,
            path,
            type: 'image',
            duration: 0,
            size: 0,
          }
          addMediaAsset(asset)
        }
      }
    } catch (error) {
      console.error('Import failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getMediaType = (path: string): 'video' | 'audio' | 'image' => {
    const lower = path.toLowerCase()
    if (/\.(mp4|mov|avi|mkv|webm|flv)$/i.test(lower)) return 'video'
    if (/\.(mp3|wav|aac|flac|m4a)$/i.test(lower)) return 'audio'
    return 'image'
  }

  return {
    importMedia,
    isLoading,
  }
}
