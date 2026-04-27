import React from 'react'
import { Loader2 } from 'lucide-react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon, loading, disabled, className = '', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center gap-2 font-medium rounded transition-colors focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed'
    
    const variantStyles = {
      primary: 'bg-accent text-white hover:opacity-90',
      secondary: 'bg-surface-raised border border-border hover:bg-border',
      ghost: 'transparent hover:bg-surface-raised',
      danger: 'bg-danger text-white hover:opacity-90',
    }
    
    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm gap-1',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    }
    
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
