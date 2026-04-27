import React, { useRef, useEffect } from 'react'
import { TimelineToolbar } from './TimelineToolbar'
import { TimelineRuler } from './TimelineRuler'
import { TrackList } from './TrackList'
import { Track } from './Track'
import { Playhead } from './Playhead'
import { useTimelineStore } from '../../../store/timelineStore'
import { usePlayback } from '../../../hooks/usePlayback'

export const Timeline: React.FC = () => {
  const { tracks, clips, pixelsPerSecond, scrollLeft, setScrollLeft } = useTimelineStore()
  const { currentTime, duration, frameRate } = usePlayback()
  const containerRef = useRef<HTMLDivElement>(null)

  const totalHeight = tracks.reduce((sum, t) => sum + t.height, 0)
  const contentWidth = Math.max(1000, duration * pixelsPerSecond)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    setScrollLeft(target.scrollLeft)
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const playheadX = currentTime * pixelsPerSecond
    const containerWidth = container.clientWidth
    const scrollPadding = 100

    if (playheadX < scrollLeft + scrollPadding) {
      setScrollLeft(Math.max(0, playheadX - scrollPadding))
    } else if (playheadX > scrollLeft + containerWidth - scrollPadding) {
      setScrollLeft(Math.min(playheadX - containerWidth + scrollPadding, contentWidth - containerWidth))
    }
  }, [currentTime, pixelsPerSecond, scrollLeft, setScrollLeft, contentWidth])

  return (
    <div className="h-72 bg-surface border-t border-border flex flex-col">
      <TimelineToolbar />

      <div className="flex-1 flex overflow-hidden">
        <TrackList />

        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin"
        >
          <div
            style={{
              width: `${contentWidth}px`,
              minHeight: `${totalHeight + 30}px`,
            }}
          >
            <TimelineRuler
              pixelsPerSecond={pixelsPerSecond}
              scrollLeft={scrollLeft}
              onSeek={(time) => {
                // seek function would go here
              }}
            />

            <div style={{ position: 'relative', height: totalHeight }}>
              {tracks.map((track) => (
                <Track
                  key={track.id}
                  track={track}
                  pixelsPerSecond={pixelsPerSecond}
                  clips={clips}
                />
              ))}

              <Playhead
                pixelsPerSecond={pixelsPerSecond}
                duration={duration}
                scrollLeft={scrollLeft}
                trackHeight={totalHeight}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
