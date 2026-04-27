import { useTimelineStore } from '../store/timelineStore'
import { useProjectStore } from '../store/projectStore'
import type { Clip, MediaAsset } from '../types'

export const useTimeline = () => {
  const { tracks, clips, zoomLevel, scrollLeft, pixelsPerSecond, addClip, removeClip, updateClip, moveClip, setZoom, setScrollLeft } = useTimelineStore()
  const { mediaAssets } = useProjectStore()

  const addClipFromAsset = (asset: MediaAsset, trackId: string, startTime: number) => {
    const clip: Clip = {
      id: `clip-${Date.now()}`,
      trackId,
      mediaId: asset.id,
      startTime,
      duration: Math.min(asset.duration, 10),
      trimIn: 0,
      trimOut: asset.duration,
      x: startTime * pixelsPerSecond,
      y: 0,
      width: Math.min(asset.duration, 10) * pixelsPerSecond,
      height: 0,
      opacity: 100,
      rotation: 0,
    }
    addClip(clip)
  }

  const getClipsForTrack = (trackId: string) => {
    return clips.filter((c) => c.trackId === trackId)
  }

  const getMediaAsset = (mediaId: string) => {
    return mediaAssets.find((a) => a.id === mediaId)
  }

  return {
    tracks,
    clips,
    zoomLevel,
    scrollLeft,
    pixelsPerSecond,
    addClip,
    removeClip,
    updateClip,
    moveClip,
    setZoom,
    setScrollLeft,
    addClipFromAsset,
    getClipsForTrack,
    getMediaAsset,
  }
}
