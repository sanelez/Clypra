import React, { useEffect } from 'react'
// @ts-ignore - react-dnd types issue
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { EditorLayout } from '../editor/EditorLayout'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { usePlaybackStore } from '../../store/playbackStore'
import { useProjectStore } from '../../store/projectStore'

export const EditorScreen: React.FC = () => {
  useKeyboardShortcuts()
  const { setDuration } = usePlaybackStore()
  const { project } = useProjectStore()

  useEffect(() => {
    if (project) {
      setDuration(project.duration)
    }
  }, [project, setDuration])

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="w-full h-full">
        <EditorLayout />
      </div>
    </DndProvider>
  )
}
