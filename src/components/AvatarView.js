// Updated AvatarView.js with integrated toast and purechat support
import React from "react";
import { TrulienceAvatar } from "@trulience/react-sdk"
import { Toast } from "./Toast";

/**
 * Component to display the Trulience Avatar with integrated toast notifications
 */
export const AvatarView = ({
  isAppConnected,
  isConnectInitiated,
  isAvatarLoaded,
  loadProgress,
  trulienceConfig,
  trulienceAvatarRef,
  eventCallbacks,
  children,
  isFullscreen,
  toggleFullscreen,
  toast, // Add toast prop here
  isPureChatMode = false,
}) => {
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
              // Minimize icon
              <>
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </>
            ) : (
              // Maximize icon
              <>
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </>
            )}
          </svg>
        </button>
      )}


      {/* Trulience Avatar - hidden when not connected or in purechat mode without connection */}
      <div className={`trulience-avatar ${(!isAppConnected || (isPureChatMode && !isAppConnected)) ? "hidden" : ""}`}>
        <TrulienceAvatar
          key={trulienceConfig.avatarId}
          url={trulienceConfig.trulienceSDK}
          ref={trulienceAvatarRef}
          avatarId={trulienceConfig.avatarId}
          token={trulienceConfig.avatarToken}
          eventCallbacks={eventCallbacks}
          width="100%"
          height="100%"
          backgroundColor="transparent"
          autoConnect={false}
        />
      </div>

      {/* Loading overlay - only show if connected but avatar not loaded */}
      {isConnectInitiated && !isAvatarLoaded && !isPureChatMode && (
        <div className="loading-overlay">
          <div className="progress-bar">
            <div
              className="progress-indicator"
              style={{ width: `${loadProgress * 100}%` }}
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