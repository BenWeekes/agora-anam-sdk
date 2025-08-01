// src/App.js
import React, {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import "./App.css";
import "./skins/WhatsApp.css";
import "./skins/Dating.css";
import "./skins/TeamsDark.css";
import "./skins/FaceTime.css";
import { AnamAvatarView } from "./components/AnamAvatarView";
import ContentViewer from "./components/ContentView";
import { ControlButtons } from "./components/ControlButtons";
import { RtmChatPanel } from "./components/RtmChatPanel";
import { Toast, useToast } from "./components/Toast";
import { useAgoraConnection } from "./hooks/useAgoraConnection";
import { useAppConfig } from "./hooks/useAppConfig";
import { useContentManager } from "./hooks/useContentManager";
import useOrientationListener from "./hooks/useOrientationListener";
import useAnamAvatarManager from "./hooks/useAnamAvatarManager";
import { connectionReducer, ConnectionState, initialConnectionState, checkIfFullyConnected } from "./utils/connectionState";
import ConnectScreen from "./components/ConnectScreen";
import useLayoutState from "./hooks/useLayoutState";
import useKeyboardAwareAvatarPosition from "./hooks/useKeyboardAwareAvatarPosition";
import Logger from "./utils/logger";

function App() {
  const [connectionState, updateConnectionState] = useReducer(connectionReducer, initialConnectionState)
  const isConnectInitiated = connectionState.app.connectInitiated;
  const isAppConnected = checkIfFullyConnected(connectionState)
  const [anamSessionToken, setAnamSessionToken] = useState(null);
  const [waitingForAvatar, setWaitingForAvatar] = useState(false);

  // Utils
  const { toast, showToast } = useToast();
  const orientation = useOrientationListener()
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Always show RTM by default
  const [isRtmVisible, setIsRtmVisible] = useState(true);

  // Agent endpoint configuration
  const agentEndpoint = process.env.REACT_APP_AGENT_ENDPOINT;

  // Refs for Agora client
  const agoraClient = useRef(null);

  // App-level config and derived values
  const {
    urlParams,
    agoraConfig,
    setAgoraConfig,
    derivedChannelName,
  } = useAppConfig();

  // Check if we're in purechat mode
  const isPureChatMode = urlParams.purechat === true;

  // Get the skin type (default to whatsapp)
  const skinType = urlParams.skin || "whatsapp";

  Logger.log("Connection state:", {
    isPureChatMode,
    isAppConnected,
    derivedChannelName,
    skinType,
    connectionState: {
      avatar: connectionState.avatar.wsConnected,
      agent: connectionState.agent.connected,
      agora: connectionState.agora.connected
    }
  });

  /** Prevent avatar from disappearing off the top of the screen when the keyboard is opened  */
  useKeyboardAwareAvatarPosition("main-video-container")

  // Manage Anam avatar lifecycle and messaging
  const {
    anamClient,
    isAnamReady,
    processAndSendMessageToAvatar,
    resetAvatarToDefault,
    connectAvatar,
    disconnectAvatar
  } = useAnamAvatarManager({
    showToast,
    updateConnectionState,
    anamSessionToken,
    eventHandler: {
      "avatar-status-update": (data) => {
        agoraConnection.handleContinueParamOnAvatarStatus(data)
      },
      "message-history-updated": (messages) => {
        // Handle message history updates if needed
        console.log("Anam message history:", messages);
      }
    }
  });

  // Debug logging for connection state
  useEffect(() => {
    console.log("[STATE] Connection state changed:", {
      isAppConnected,
      isConnectInitiated,
      avatar: {
        ready: connectionState.avatar.ready,
        loaded: connectionState.avatar.loaded,
        wsConnected: connectionState.avatar.wsConnected
      },
      agent: connectionState.agent.connected,
      agora: connectionState.agora.connected,
      rtm: connectionState.rtm.connected
    });
  }, [connectionState, isAppConnected, isConnectInitiated]);

  // Debug logging for state changes - moved here after isAnamReady is defined
  useEffect(() => {
    console.log("[STATE] waitingForAvatar changed to:", waitingForAvatar);
  }, [waitingForAvatar]);

  useEffect(() => {
    console.log("[STATE] isAnamReady changed to:", isAnamReady);
  }, [isAnamReady]);

  // Initialize Agora connection hook with Anam session token setter
  const agoraConnection = useAgoraConnection({
    agoraConfig,
    setAgoraConfig,
    derivedChannelName,
    agentEndpoint,
    updateConnectionState,
    processAndSendMessageToAvatar,
    showToast,
    agoraClientRef: agoraClient,
    urlParams,
    isFullyConnected: isAppConnected,
    setAnamSessionToken // Pass the setter to get Anam token from endpoint
  });

  // Manage content display state and related data
  const contentManager = useContentManager(isConnectInitiated);

  // remove preload screen
  useEffect(() => {
    let timer = null;
    updateConnectionState(ConnectionState.APP_LOADED)
    const loader = document.getElementById('preloader');
    if (loader) {
      loader.style.display = 'none'
      timer = setTimeout(() => loader.remove(), 300);
    }
    return () => clearTimeout(timer);
  }, []);

  // Auto-connect for purechat mode
  const pureChatConnectionAttempted = useRef(false);

  useEffect(() => {
    const shouldConnect = connectionState.app.loaded &&
      isPureChatMode &&
      !isConnectInitiated &&
      !pureChatConnectionAttempted.current;

    if (shouldConnect) {
      console.log("Auto-connecting purechat mode (silent) - RTM only, no UI change");
      pureChatConnectionAttempted.current = true;

      agoraConnection.connectToPureChat().catch((error) => {
        console.error("Purechat connection failed:", error);
        pureChatConnectionAttempted.current = false;
      });
    }

    if (!isPureChatMode || !connectionState.app.loaded) {
      pureChatConnectionAttempted.current = false;
    }
  }, [connectionState.app.loaded, isPureChatMode, isConnectInitiated, agoraConnection]);

  // Play the video after app is connected
  useEffect(() => {
    if (urlParams.contentType && urlParams.contentURL) {
      contentManager.setContentData({
        type: urlParams.contentType,
        url: urlParams.contentURL,
        alt: urlParams.contentALT || "Content"
      });
    }
  }, [urlParams, contentManager]);

  useEffect(() => {
    if (isAppConnected && urlParams.contentType && urlParams.contentURL) {
      contentManager.showContentAndPlayVideo()
    }
  }, [urlParams, isAppConnected, contentManager]);

  // Connect to Anam avatar when we have session token
  useEffect(() => {
    if (anamSessionToken && !connectionState.avatar.wsConnected && anamClient) {
      console.log("App.js: Have session token, connecting avatar...");
      connectAvatar();
    }
  }, [anamSessionToken, connectionState.avatar.wsConnected, anamClient, connectAvatar]);

  // When avatar is ready and we're waiting for it, complete the Agora connection
  useEffect(() => {
    console.log("[CONNECTION] Avatar ready check:", {
      waitingForAvatar,
      isAnamReady,
      shouldComplete: waitingForAvatar && isAnamReady
    });

    if (waitingForAvatar && isAnamReady) {
      console.log("[CONNECTION] Avatar is ready, completing Agora connection...");
      const completeStartTime = performance.now();
      setWaitingForAvatar(false);
      agoraConnection.completeAgoraConnection().then(success => {
        console.log(`[CONNECTION] Agora connection completed in ${(performance.now() - completeStartTime).toFixed(0)}ms, success:`, success);
      });
    }
  }, [waitingForAvatar, isAnamReady, agoraConnection]);

  // Toggle fullscreen mode
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      setIsRtmVisible(false);
    } else {
      setIsRtmVisible(true);
    }
    setIsFullscreen(!isFullscreen);
  };

  // Handle hangup
  const handleHangup = useCallback(async () => {
    updateConnectionState(ConnectionState.DISCONNECTING);

    contentManager.hideContent()

    // Reset the avatar
    if (!isPureChatMode) {
      resetAvatarToDefault()
    }

    // Disconnect from all services
    await agoraConnection.disconnectFromAgora();
    disconnectAvatar();

    // Clear Anam session token
    setAnamSessionToken(null);
    setWaitingForAvatar(false);

    updateConnectionState(ConnectionState.DISCONNECT);

    // Exit fullscreen mode if active
    if (isFullscreen) {
      setIsFullscreen(false);
      setIsRtmVisible(true);
    }
  }, [updateConnectionState, contentManager, isPureChatMode, resetAvatarToDefault, agoraConnection, disconnectAvatar, isFullscreen]);

  // Connect Function for normal mode - Modified to wait for avatar
  const connectAgoraAnam = useCallback(async () => {
    console.log("[CONNECTION] === Starting connection flow ===");
    const startTime = performance.now();

    updateConnectionState(ConnectionState.APP_CONNECT_INITIATED);

    if (urlParams.contentType && urlParams.contentURL) {
      contentManager.unlockVideo();
    }

    // Mark that we're waiting for avatar BEFORE starting the connection
    // This ensures the state is set when avatar becomes ready
    setWaitingForAvatar(true);

    // Use the connectToAgora function which handles everything properly
    const result = await agoraConnection.connectToAgora();
    console.log(`[CONNECTION] Total connection time: ${(performance.now() - startTime).toFixed(0)}ms, result:`, result);

    if (!result) {
      setWaitingForAvatar(false);
      handleHangup();
      return;
    }

    // The connectToAgora function will have stored pending data if there's an Anam token
    // We just need to wait for the avatar to be ready

  }, [agoraConnection, urlParams.contentType, urlParams.contentURL, contentManager, updateConnectionState, handleHangup]);

  const layoutState = useLayoutState(contentManager, urlParams, orientation);
  const { isMobileView, isContentLayoutWide, isContentLayoutDefault, isAvatarOverlay, isContentLayoutWideOverlay } = layoutState;

  // Loading screen will be shown till we set loading true
  if (connectionState.app.loading) {
    return null;
  }

  /* Console debug info instead of UI display */
  if (process.env.NODE_ENV === "development") {
    console.log("Debug Info:", {
      purechat: isPureChatMode,
      connected: isConnectInitiated,
      agoraClient: !!agoraClient.current,
      rtmClient: !!agoraConnection.rtmClient,
      anamClient: !!anamClient,
      anamReady: isAnamReady,
      waitingForAvatar,
      skin: skinType,
    });
  }

  const appContainerClasses = [
    "app-container",
    `${skinType}-skin`,
    !isConnectInitiated && "initial-screen",
    isRtmVisible && !isFullscreen && "rtm-visible",
    orientation,
    isAvatarOverlay && "avatar-over-content",
  ].filter(Boolean).join(" ");

  const leftSectionStyle = {
    width:
      isContentLayoutWideOverlay || isMobileView
        ? "100%"
        : isContentLayoutWide
          ? "50%"
          : undefined,
    height: isContentLayoutWideOverlay ? "50%" : undefined,
    position: "relative",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  };

  const avatarWrapperStyle = {
    position: isAvatarOverlay
      ? "relative"
      : isMobileView ? "unset" : "relative",
    width:
      (isContentLayoutWideOverlay && isAvatarOverlay) || (isAvatarOverlay && isMobileView)
        ? "fit-content"
        : "100%",
    height:
      !isContentLayoutWideOverlay && isAvatarOverlay && !isMobileView
        ? "fit-content"
        : "100%",
  };

  // Get avatar profile image from Anam endpoint if available
  const getAvatarProfileImage = () => {
    // You might want to get this from the Anam configuration or endpoint
    // For now, using a placeholder
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='8' r='5'/%3E%3Cpath d='M20 21a8 8 0 0 0-16 0'/%3E%3C/svg%3E`;
  };

  return (
    <div className={appContainerClasses} >
      {/* This content view will be display when contentLayout is wide */}
      {isContentLayoutWide && (
        <ContentViewer
          contentData={contentManager.contentData}
          style={{ height: "50vh", width: "100vw", position: "relative" }}
        />
      )}

      {/* Content wrapper - always in split view unless fullscreen */}
      <div
        className={
          `content-wrapper ${!isFullscreen ? "split-view" : ""} ${orientation}`
        }
        style={{
          flexDirection:
            isContentLayoutWideOverlay || isMobileView ? "column" : "row",
        }}
      >
        <div
          className={`left-section`}
          style={leftSectionStyle}
        >
          <div id="main-video-container" style={{ width: "100%", height: "100%" }}>

            {!isAppConnected && (
              <ConnectScreen
                avatarId={null} // No avatarId for Anam
                isPureChatMode={isPureChatMode}
                connectionState={connectionState}
                onConnect={connectAgoraAnam}
                onHangUp={handleHangup}
                getProfileImage={getAvatarProfileImage}
              />
            )}

            {/* Show spinner if waiting for avatar
            {waitingForAvatar && isConnectInitiated && !isAppConnected && (
              <div className="spinner-container">
                <div className="spinner"></div>
              </div>
            )}
 */}
            {/* Toast notification - placed inside avatar container */}
            <Toast {...toast} />

            <div style={avatarWrapperStyle} >
              {/* Content container - shown when content mode is active */}
              <ContentViewer
                contentData={contentManager.contentData}
                style={{
                  height: isAvatarOverlay && "100%",
                  display: isContentLayoutDefault && isAppConnected ? "flex" : "none"
                }}
              />

              {/* Avatar container wrapper */}
              <div
                className={`avatar-container-wrapper ${isAvatarOverlay || (isContentLayoutDefault && isMobileView)
                    ? "floating"
                    : ""
                  }`}
                style={{
                  height:
                    isContentLayoutDefault && !isAvatarOverlay && !isMobileView
                      ? "50%"
                      : isAvatarOverlay && urlParams.avatarOverlayHeight ? `${urlParams.avatarOverlayHeight}px` : undefined,
                  width: isAvatarOverlay && urlParams.avatarOverlayWidth ? `${urlParams.avatarOverlayWidth}px` : undefined,
                  bottom: isAvatarOverlay && urlParams.avatarOverlayBottom !== undefined ? `${urlParams.avatarOverlayBottom}px` : undefined,
                  right: isAvatarOverlay && urlParams.avatarOverlayRight !== undefined ? `${urlParams.avatarOverlayRight}px` : undefined
                }}
              >
                <AnamAvatarView
                  isAppConnected={isAppConnected}
                  isConnectInitiated={isConnectInitiated}
                  isAvatarLoaded={connectionState.avatar.loaded}
                  anamClient={anamClient}
                  isFullscreen={isFullscreen}
                  toggleFullscreen={toggleFullscreen}
                  toast={toast.visible ? toast : null}
                  isPureChatMode={isPureChatMode}
                >
                  {/* Control buttons when connected */}
                  {isAppConnected && (
                    <ControlButtons
                      isConnectInitiated={isConnectInitiated}
                      isMuted={agoraConnection.isMuted}
                      toggleMute={agoraConnection.toggleMute}
                      handleHangup={handleHangup}
                    />
                  )}
                </AnamAvatarView>
              </div>
            </div>
          </div>
        </div>

        {/* RTM Chat Panel - always visible unless in fullscreen mode */}
        <RtmChatPanel
          rtmClient={agoraConnection.rtmClient}
          rtmMessages={agoraConnection.rtmMessages}
          rtmJoined={connectionState.rtm.connected}
          agoraConfig={agoraConfig}
          agoraClient={agoraClient.current}
          isConnectInitiated={isConnectInitiated}
          processMessage={processAndSendMessageToAvatar}
          isFullscreen={isFullscreen}
          registerDirectSend={agoraConnection.registerDirectRtmSend}
          urlParams={urlParams}
          getMessageChannelName={agoraConnection.getMessageChannelName}
        />

      </div>
    </div>
  );
}

export default App;