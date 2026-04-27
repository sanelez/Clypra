import { create } from 'zustand'
import type { Track, Clip } from '../types'

interface TimelineStore {
  tracks: Track[]
  clips: Clip[]
  zoomLevel: number
  scrollLeft: number
  pixelsPerSecond: number
  addTrack: (type: 'video' | 'audio' | 'text') => void
  removeTrack: (trackId: string) => void
  addClip: (clip: Clip) => void
  removeClip: (clipId: string) => void
  updateClip: (clipId: string, updates: Partial<Clip>) => void
  moveClip: (clipId: string, startTime: number) => void
  setZoom: (level: number) => void
  setScrollLeft: (left: number) => void
  splitClipAtTime: (clipId: string, time: number) => void
}

const trackHeights: Record<string, number> = {
  video: 80,
  audio: 56,
  text: 60,
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  tracks: [
    { id: 'track-1', type: 'video', name: 'Video 1', muted: false, locked: false, height: 80 },
    { id: 'track-2', type: 'audio', name: 'Audio 1', muted: false, locked: false, height: 56 },
  ],
  clips: [],
  zoomLevel: 1.0,
  scrollLeft: 0,
  pixelsPerSecond: 100,

  addTrack: (type) => {
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${Date.now() % 100}`,
      muted: false,
      locked: false,
      height: trackHeights[type],
    }
    set((state) => ({
      tracks: [...state.tracks, newTrack],
    }))
  },

  removeTrack: (trackId) => {
    set((state) => ({
      tracks: state.tracks.filter((t) => t.id !== trackId),
      clips: state.clips.filter((c) => c.trackId !== trackId),
    }))
  },

  addClip: (clip) => {
    set((state) => ({
      clips: [...state.clips, clip],
    }))
  },

  removeClip: (clipId) => {
    set((state) => ({
      clips: state.clips.filter((c) => c.id !== clipId),
    }))
  },

  updateClip: (clipId, updates) => {
    set((state) => ({
      clips: state.clips.map((c) => (c.id === clipId ? { ...c, ...updates } : c)),
    }))
  },

  moveClip: (clipId, startTime) => {
    set((state) => ({
      clips: state.clips.map((c) => (c.id === clipId ? { ...c, startTime } : c)),
    }))
  },

  setZoom: (level) => {
    const clamped = Math.max(0.5, Math.min(level, 5))
    set({
      zoomLevel: clamped,
      pixelsPerSecond: 100 * clamped,
    })
  },

  setScrollLeft: (left) => {
    set({ scrollLeft: left })
  },

  splitClipAtTime: (clipId, time) => {
    const state = get()
    const clip = state.clips.find((c) => c.id === clipId)
    if (!clip) return

    const clipEndTime = clip.startTime + clip.duration
    if (time <= clip.startTime || time >= clipEndTime) return

    const timeSinceStart = time - clip.startTime
    const newClip: Clip = {
      ...clip,
      id: `clip-${Date.now()}`,
      startTime: time,
      duration: clip.duration - timeSinceStart,
      trimIn: clip.trimIn + timeSinceStart,
    }

    set((state) => ({
      clips: [
        ...state.clips.map((c) =>
          c.id === clipId
            ? { ...c, duration: timeSinceStart, trimOut: clip.trimOut - (clip.duration - timeSinceStart) }
            : c
        ),
        newClip,
      ],
    }))
  },
}))
