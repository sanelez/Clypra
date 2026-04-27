import React, { useState } from 'react'
import { Film, RotateCcw, RotateCw, Upload } from 'lucide-react'
import { Button } from '../ui/Button'
import { usePlayback } from '../../hooks/usePlayback'
import { useProjectStore } from '../../store/projectStore'

interface TopBarProps {
  onExport?: () => void
}

export const TopBar: React.FC<TopBarProps> = ({ onExport }) => {
  const { currentTime, duration, formatTime } = usePlayback()
  const { project, updateProject } = useProjectStore()
  const [isEditingName, setIsEditingName] = useState(false)
  const [projectName, setProjectName] = useState(project?.name || '')

  const handleNameBlur = () => {
    if (projectName.trim() && projectName !== project?.name) {
      updateProject({ name: projectName })
    } else {
      setProjectName(project?.name || '')
    }
    setIsEditingName(false)
  }

  return (
    <div className="h-12 bg-surface border-b border-border flex items-center justify-between px-4 gap-4">
      <div className="flex items-center gap-3">
        <Film className="w-5 h-5 text-accent" />
        {isEditingName ? (
          <input
            autoFocus
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyPress={(e) => e.key === 'Enter' && handleNameBlur()}
            className="bg-surface-raised border border-accent rounded px-2 py-1 text-sm text-text-primary focus:outline-none"
          />
        ) : (
          <button
            onClick={() => setIsEditingName(true)}
            className="text-sm font-medium text-text-primary hover:text-accent transition-colors"
          >
            {project?.name}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-text-primary">
        <span>{formatTime(currentTime)}</span>
        <span className="text-text-muted">/</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" icon={<RotateCcw className="w-4 h-4" />} title="Undo" />
        <Button variant="ghost" size="sm" icon={<RotateCw className="w-4 h-4" />} title="Redo" />
        <div className="w-px h-6 bg-border" />
        <Button
          variant="primary"
          size="sm"
          icon={<Upload className="w-4 h-4" />}
          onClick={onExport}
        >
          Export
        </Button>
      </div>
    </div>
  )
}
