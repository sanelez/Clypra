import React from 'react'
import { TopBar } from './TopBar'
import { MediaPanel } from './MediaPanel'
import { PreviewPanel } from './PreviewPanel'
import { PropertiesPanel } from './PropertiesPanel'
import { Timeline } from './timeline/Timeline'

export const EditorLayout: React.FC = () => {
  return (
    <div className="w-full h-full flex flex-col bg-bg">
      <TopBar />

      <div className="flex-1 flex overflow-hidden">
        <MediaPanel />

        <div className="flex-1 flex flex-col overflow-hidden">
          <PreviewPanel />

          <Timeline />
        </div>

        <PropertiesPanel />
      </div>
    </div>
  )
}
