import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore } from "../store/projectStore";
import type { MediaAsset, VideoMetadata } from "../types";
import { generateSimpleWaveform } from "../lib/audioWaveformGenerator";

export const useMediaImport = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { addMediaAsset } = useProjectStore();

  const importMedia = async () => {
    try {
      setIsLoading(true);
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Media",
            extensions: ["mp4", "mov", "avi", "mkv", "mp3", "wav", "aac", "jpg", "png", "webp"],
          },
        ],
      });

      if (!selected) return;

      const files = Array.isArray(selected) ? selected : [selected];

      for (const path of files) {
        try {
          const filename = path.split("/").pop() || "Unknown";
          const type = getMediaType(path);

          if (type === "video" || type === "audio") {
            console.log(`[useMediaImport] Getting metadata for: ${path}`);
            const metadata: VideoMetadata = await invoke("get_video_metadata", { path });
            console.log(`[useMediaImport] Metadata received:`, metadata);

            // Generate poster frame/thumbnail
            let posterFrame: string | undefined;
            let coverArt: string | undefined;

            if (type === "video") {
              // Use extract_poster_frame_command which extracts at 10% of duration (avoids black frames at 0s)
              posterFrame = (await invoke("extract_poster_frame_command", {
                videoPath: path,
                duration: metadata.duration,
                dpr: 1.0,
              }).catch((err) => {
                console.error("Failed to extract poster frame:", err);
                return undefined;
              })) as string | undefined;
            } else if (type === "audio") {
              // Try to extract album artwork from audio file
              try {
                coverArt = (await invoke("extract_audio_artwork", { path })) as string | undefined;
                if (coverArt) {
                  console.log("[useMediaImport] Extracted album artwork");
                }
              } catch (err) {
                console.log("[useMediaImport] No album artwork found");
              }

              // Generate waveform thumbnail for audio files
              try {
                posterFrame = generateSimpleWaveform({
                  width: 160,
                  height: 90,
                  barCount: 32,
                  barColor: "#22d3ee",
                  backgroundColor: "#1e293b",
                });
                console.log("[useMediaImport] Generated waveform thumbnail for audio");
              } catch (err) {
                console.error("Failed to generate waveform:", err);
              }
            }

            const asset: MediaAsset = {
              id: `asset-${Date.now()}-${Math.random()}`,
              name: filename,
              path,
              type,
              duration: metadata.duration,
              width: metadata.width,
              height: metadata.height,
              posterFrame,
              coverArt,
              size: metadata.size,
            };
            console.log(`[useMediaImport] Adding asset with duration=${asset.duration}`);
            addMediaAsset(asset);
          } else {
            // For images, use the convertFileSrc to create a proper asset URL
            const { convertFileSrc } = await import("@tauri-apps/api/core");
            const asset: MediaAsset = {
              id: `asset-${Date.now()}-${Math.random()}`,
              name: filename,
              path,
              type: "image",
              duration: 0,
              size: 0,
              posterFrame: convertFileSrc(path), // Use the image itself as preview
            };
            addMediaAsset(asset);
          }
        } catch (fileError) {
          console.error(`Failed to import ${path}:`, fileError);
          // Continue with next file instead of stopping
        }
      }
    } catch (error) {
      console.error("Import failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getMediaType = (path: string): "video" | "audio" | "image" => {
    const lower = path.toLowerCase();
    if (/\.(mp4|mov|avi|mkv|webm|flv)$/i.test(lower)) return "video";
    if (/\.(mp3|wav|aac|flac|m4a)$/i.test(lower)) return "audio";
    return "image";
  };

  return {
    importMedia,
    isLoading,
  };
};
