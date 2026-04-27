import React, { useState } from 'react'

export interface TooltipProps {
  content: string
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, side = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false)

  const sideStyles = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  }

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setTimeout(() => setIsVisible(true), 500)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div
          className={`absolute ${sideStyles[side]} bg-surface-raised text-text-primary text-sm px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none`}
        >
          {content}
        </div>
      )}
    </div>
  )
}
