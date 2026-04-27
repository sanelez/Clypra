/**
 * Success Toast Component
 * Displays success messages with appropriate styling
 */

import { useEffect, useState } from "react";

export interface SuccessToastProps {
  message: string | null;
  onDismiss?: () => void;
  autoHideDuration?: number; // milliseconds, 0 to disable auto-hide
}

/**
 * Displays success messages with appropriate styling and auto-dismiss
 */
export function SuccessToast({ message, onDismiss, autoHideDuration = 3000 }: SuccessToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);

      // Auto-hide after duration if enabled
      if (autoHideDuration > 0) {
        const timer = setTimeout(() => {
          setVisible(false);
          if (onDismiss) {
            setTimeout(onDismiss, 300); // Wait for fade-out animation
          }
        }, autoHideDuration);

        return () => clearTimeout(timer);
      }
    } else {
      setVisible(false);
    }
  }, [message, autoHideDuration, onDismiss]);

  if (!message) return null;

  const handleDismiss = () => {
    setVisible(false);
    if (onDismiss) {
      setTimeout(onDismiss, 300); // Wait for fade-out animation
    }
  };

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 max-w-md rounded-lg shadow-lg transition-all duration-300 ${visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0 pointer-events-none"}`}
      style={{
        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
      }}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div className="shrink-0 mt-0.5">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">Success</p>
          <p className="mt-1 text-sm text-white/90">{message}</p>
        </div>

        {/* Dismiss button */}
        <button onClick={handleDismiss} className="shrink-0 ml-2 text-white/80 hover:text-white transition-colors" aria-label="Dismiss success message">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
