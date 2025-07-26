// src/components/AnamAvatarView.js
import React, { useRef, useEffect, useState } from "react";

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
  const [isStreamingStarted, setIsStreamingStarted] = useState(false);

  // Debug log to check what props we're receiving
  useEffect(() => {
    console.log("AnamAvatarView props:", {
      isAppConnected,
      isConnectInitiated,
      isAvatarLoaded,
      hasAnamClient: !!anamClient,
      isFullscreen,
      isPureChatMode
    });
  }, [isAppConnected, isConnectInitiated, isAvatarLoaded, anamClient, isFullscreen, isPureChatMode]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;
    
    // Only attempt to stream when:
    // 1. We have an anam client
    // 2. The video element exists
    // 3. We haven't already started streaming
    // 4. The avatar is loaded (session is ready)
    // 5. Component is still mounted
    if (anamClient && videoRef.current && !isStreamingStarted && isAvatarLoaded && isMounted) {
      console.log("Scheduling Anam avatar streaming...");
      
      // Add a small delay to ensure the session is fully established
      timeoutId = setTimeout(() => {
        if (!isMounted) return;
        
        console.log("Attempting to stream Anam avatar to video element:", videoRef.current.id);
        console.log("Video element exists:", !!videoRef.current);
        console.log("Anam client methods available:", {
          streamToVideoAndAudioElements: typeof anamClient.streamToVideoAndAudioElements === 'function',
          streamToVideoElement: typeof anamClient.streamToVideoElement === 'function',
          stream: typeof anamClient.stream === 'function'
        });
        
        setIsStreamingStarted(true);
        
        // Stream Anam avatar to video element
        anamClient.streamToVideoAndAudioElements(videoRef.current.id)
          .then(() => {
            if (isMounted) {
              setIsVideoReady(true);
              console.log("Anam avatar streaming started successfully");
            }
          })
          .catch((error) => {
            console.error("Failed to stream Anam avatar:", error);
            console.error("Error details:", error.message, error.stack);
            if (isMounted) {
              setIsStreamingStarted(false); // Reset so we can retry
            }
          });
      }, 500); // 500ms delay
    }
    
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [anamClient, isStreamingStarted, isAvatarLoaded]);

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
        className={`anam-avatar ${(!isVideoReady || isPureChatMode) ? "hidden" : ""}`}
        autoPlay
        playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          backgroundColor: "#000000"
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