import { create } from 'zustand'

interface UIStore {
  selectedClipId: string | null
  selectedTrackId: string | null
  activePanel: 'media' | 'properties'
  showExportModal: boolean
  showNewProjectModal: boolean
  selectClip: (clipId: string | null) => void
  selectTrack: (trackId: string | null) => void
  setActivePanel: (panel: 'media' | 'properties') => void
  toggleExportModal: () => void
  toggleNewProjectModal: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  selectedClipId: null,
  selectedTrackId: null,
  activePanel: 'media',
  showExportModal: false,
  showNewProjectModal: false,

  selectClip: (clipId) => {
    set({ selectedClipId: clipId })
  },

  selectTrack: (trackId) => {
    set({ selectedTrackId: trackId })
  },

  setActivePanel: (panel) => {
    set({ activePanel: panel })
  },

  toggleExportModal: () => {
    set((state) => ({
      showExportModal: !state.showExportModal,
    }))
  },

  toggleNewProjectModal: () => {
    set((state) => ({
      showNewProjectModal: !state.showNewProjectModal,
    }))
  },
}))
