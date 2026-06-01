import React from "react";
import { Trash2, HardDrive, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import { useCacheManager } from "@/hooks/useCacheManager";

export const CacheSettings: React.FC = () => {
  const {
    isClearing,
    cacheInfo,
    lastResult,
    clearAllCaches,
    clearAppCache,
    clearWebViewCache,
    clearGPUCache,
  } = useCacheManager();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted mb-2">Cache Management</h3>
        <p className="text-[11px] text-text-muted">Clear cached data to free up disk space or resolve performance issues.</p>
      </div>

      {/* Cache Info */}
      {cacheInfo && (
        <div className="bg-surface-raised/30 border border-white/6 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <HardDrive className="w-4 h-4 text-accent" />
            <span className="font-semibold text-text-primary">Cache Status</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div className="bg-surface-raised/50 rounded p-2 border border-white/5">
              <div className="text-text-muted">localStorage Items</div>
              <div className="text-text-primary font-semibold mt-1">{cacheInfo.localStorage}</div>
            </div>

            <div className="bg-surface-raised/50 rounded p-2 border border-white/5">
              <div className="text-text-muted">sessionStorage Items</div>
              <div className="text-text-primary font-semibold mt-1">{cacheInfo.sessionStorage}</div>
            </div>

            {cacheInfo.gpuCache && (
              <>
                <div className="bg-surface-raised/50 rounded p-2 border border-white/5">
                  <div className="text-text-muted">GPU Textures</div>
                  <div className="text-text-primary font-semibold mt-1">{cacheInfo.gpuCache.textureCount || 0}</div>
                </div>

                <div className="bg-surface-raised/50 rounded p-2 border border-white/5">
                  <div className="text-text-muted">GPU Memory</div>
                  <div className="text-text-primary font-semibold mt-1">{cacheInfo.gpuCache.memoryMB || "0"} MB</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Clear Result Message */}
      {lastResult && (
        <div className={`flex items-start gap-3 p-4 rounded-lg border text-xs ${lastResult.success ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
          {lastResult.success ? <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
          <div className="flex-1">
            <p className="font-medium">{lastResult.message}</p>
            {lastResult.stats?.errors && lastResult.stats.errors.length > 0 && (
              <ul className="mt-2 text-[10px] space-y-1">
                {lastResult.stats.errors.map((error: string, idx: number) => (
                  <li key={idx}>• {error}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Clear Cache Actions */}
      <div className="space-y-3">
        <button onClick={() => clearAllCaches({ localStorage: false })} disabled={isClearing} className="w-full flex items-center justify-between p-4 bg-surface-raised/30 hover:bg-surface-raised/50 border border-white/6 hover:border-accent/40 rounded-lg transition-all group disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center group-hover:bg-accent/30 transition-colors">
              <Trash2 className="w-5 h-5 text-accent" />
            </div>
            <div className="text-left">
              <div className="font-medium text-text-primary text-xs">Clear All Caches</div>
              <div className="text-[10px] text-text-muted">App cache, WebView, GPU, and IndexedDB</div>
            </div>
          </div>
          {isClearing && <RefreshCw className="w-5 h-5 text-accent animate-spin" />}
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button onClick={() => clearAppCache()} disabled={isClearing} className="flex flex-col items-center gap-2 p-4 bg-surface-raised/20 hover:bg-surface-raised/40 border border-white/6 hover:border-accent/30 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            <HardDrive className="w-5 h-5 text-accent" />
            <div className="text-[11px] font-medium text-text-primary">App Cache</div>
          </button>

          <button onClick={() => clearWebViewCache()} disabled={isClearing} className="flex flex-col items-center gap-2 p-4 bg-surface-raised/20 hover:bg-surface-raised/40 border border-white/6 hover:border-accent/30 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            <RefreshCw className="w-5 h-5 text-accent" />
            <div className="text-[11px] font-medium text-text-primary">WebView</div>
          </button>

          <button onClick={() => clearGPUCache()} disabled={isClearing} className="flex flex-col items-center gap-2 p-4 bg-surface-raised/20 hover:bg-surface-raised/40 border border-white/6 hover:border-accent/30 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            <Trash2 className="w-5 h-5 text-accent" />
            <div className="text-[11px] font-medium text-text-primary">GPU Cache</div>
          </button>
        </div>
      </div>

      {/* Warning Note */}
      <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-yellow-200/90">
          <p className="font-semibold mb-1">Important Notes:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Clearing cache may require an application restart for full effect</li>
            <li>WebView cache (Windows) may be locked by running processes</li>
            <li>Your settings and preferences will be preserved</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
