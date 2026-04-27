import React, { useState, useEffect } from 'react'
import { LaunchScreen } from './components/screens/LaunchScreen'
import { EditorScreen } from './components/screens/EditorScreen'
import { useProjectStore } from './store/projectStore'
import type { Project, AspectRatio } from './types'

const App = () => {
  const { project, createProject, loadProject, setRecentProjects } = useProjectStore()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const initializeApp = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const projectsJson: string[] = await invoke('get_recent_projects')
        const projects = projectsJson.map((json) => JSON.parse(json))
        setRecentProjects(projects)
      } catch (error) {
        console.error('Failed to initialize app:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initializeApp()
  }, [setRecentProjects])

  const handleCreateProject = (name: string, aspectRatio: AspectRatio, frameRate: 24 | 30 | 60) => {
    createProject(name, aspectRatio, frameRate)
  }

  const handleOpenProject = (proj: Project) => {
    loadProject(proj)
  }

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent mx-auto mb-4" />
          <p className="text-text-primary">Loading...</p>
        </div>
      </div>
    )
  }

  return project ? (
    <EditorScreen />
  ) : (
    <LaunchScreen onProjectCreate={handleCreateProject} onProjectOpen={handleOpenProject} />
  )
}

export default App
