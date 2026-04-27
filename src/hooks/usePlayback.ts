import { usePlaybackStore } from '../store/playbackStore'
import { useProjectStore } from '../store/projectStore'

export const usePlayback = () => {
  const { isPlaying, currentTime, duration, frameRate, play, pause, stop, seek, setDuration, setFrameRate } =
    usePlaybackStore()
  const { project } = useProjectStore()

  if (project && frameRate !== project.frameRate) {
    setFrameRate(project.frameRate)
  }

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const frames = Math.floor((seconds % 1) * frameRate)

    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return {
    isPlaying,
    currentTime,
    duration,
    frameRate,
    play,
    pause,
    stop,
    seek,
    setDuration,
    formatTime,
  }
}
