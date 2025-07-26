import React, { useRef, useEffect, useState } from "react";
import { Toast } from "./Toast";

/**
 * Component to display the Anam.ai Avatar
 */
export const AnamAvatarView = ({
  isAppConnected,
  isConnectInitiated,
  isAvatarLoaded,
  anamClient,
  children,
  isFullscreen,
  toggleFullscreen,
  toast,
  isPureChatMode = false,
}) => {
  const videoRef = useRef(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    if (anamClient && videoRef.current && !isVideoReady) {
      // Stream Anam avatar to video element
      anamClient.streamToVideoElement(videoRef.current.id)
        .then(() => {
          setIsVideoReady(true);
          console.log("Anam avatar streaming started");
        })
        .catch((error) => {
          console.error("Failed to stream Anam avatar:", error);
        });
    }
  }, [anamClient, isVideoReady]);

  return (
    <div className={`avatar-container ${isFullscreen ? "fullscreen" : ""}`}>
      {/* Fullscreen toggle button - hidden when not connected */}
      {isAppConnected && (
        <button
          className={`fullscreen-button`}
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {isFullscreen ? (
              <>
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </>
            ) : (
              <>
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </>
            )}
          </svg>
        </button>
      )}

      {/* Anam Avatar Video Element */}
      <video
        ref={videoRef}
        id="anam-avatar-video"
        className={`anam-avatar ${(!isAppConnected || (isPureChatMode && !isAppConnected)) ? "hidden" : ""}`}
        autoPlay
        playsInline
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          backgroundColor: "transparent"
        }}
      />

      {/* Loading overlay - only show if connected but avatar not loaded */}
      {isConnectInitiated && !isAvatarLoaded && !isPureChatMode && (
        <div className="loading-overlay">
          <div className="progress-bar">
            <div
              className="progress-indicator"
              style={{ width: `${50}%` }}
            />
          </div>
        </div>
      )}

      {/* Render children */}
      {children}
      <div id="floating-input"></div>
    </div>
  );
};