// src/hooks/useAnamAvatarManager.jsx
import { useCallback, useRef, useState, useEffect } from "react";
import { createClient } from "@anam-ai/js-sdk";
import { callNativeAppFunction } from "../utils/nativeBridge";
import { ConnectionState } from "../utils/connectionState";

// Event names as strings based on the documentation
const AnamEvent = {
  SESSION_READY: 'SESSION_READY',
  CONNECTION_CLOSED: 'CONNECTION_CLOSED',
  MESSAGE_HISTORY_UPDATED: 'MESSAGE_HISTORY_UPDATED',
  TALK_STARTED: 'TALK_STARTED',
  TALK_ENDED: 'TALK_ENDED',
  MESSAGE_STREAM_EVENT_RECEIVED: 'MESSAGE_STREAM_EVENT_RECEIVED'
};

export default function useAnamAvatarManager({
  showToast,
  updateConnectionState,
  anamSessionToken,
  eventHandler = {}
}) {
  const [anamClient, setAnamClient] = useState(null);
  const [isAnamReady, setIsAnamReady] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [isStreamingStarted, setIsStreamingStarted] = useState(false);
  const isSpeakingRef = useRef(false);

  const eventHandlerRef = useRef();
  eventHandlerRef.current = eventHandler;

  // Initialize Anam client when session token is available
  useEffect(() => {
    if (anamSessionToken && !anamClient) {
      console.log("[ANAM] Initializing Anam client with session token");
      
      try {
        const client = createClient(anamSessionToken);
        
        // Debug: Log the client object and its properties
        console.log("[ANAM] Created Anam client:", client);
        console.log("[ANAM] Client type:", typeof client);
        console.log("[ANAM] Client methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
        console.log("[ANAM] Client properties:", Object.keys(client));
        
        // Set up event listeners using event names
        client.addListener(AnamEvent.SESSION_READY, async () => {
          console.log("[ANAM] SESSION_READY event fired!");
          setIsAnamReady(true);
          updateConnectionState(ConnectionState.AVATAR_READY);
          updateConnectionState(ConnectionState.AVATAR_LOADED);
          updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
          callNativeAppFunction("anamSessionReady");
          
          // Start streaming after session is ready
          try {
            const videoElement = document.getElementById('anam-avatar-video');
            if (videoElement && !isStreamingStarted) {
              await client.streamToVideoAndAudioElements(videoElement.id);
              setIsStreamingStarted(true);
              console.log("[ANAM] Started streaming after SESSION_READY");
            }
          } catch (error) {
            console.error("[ANAM] Failed to start streaming after SESSION_READY:", error);
          }
        });

        client.addListener(AnamEvent.CONNECTION_CLOSED, () => {
          console.log("[ANAM] CONNECTION_CLOSED event fired!");
          setIsAnamReady(false);
          setIsStreamingStarted(false);
          updateConnectionState(ConnectionState.AVATAR_WS_DISCONNECT);
          callNativeAppFunction("anamConnectionClosed");
          
          // Reset speaking state
          isSpeakingRef.current = false;
        });

        client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (messages) => {
          console.log("[ANAM EVENT] MESSAGE_HISTORY_UPDATED event fired!", messages);
          eventHandlerRef.current["message-history-updated"]?.(messages);
        });

        client.addListener(AnamEvent.TALK_STARTED, () => {
          console.log("[ANAM] TALK_STARTED event fired!");
          isSpeakingRef.current = true;
          eventHandlerRef.current["avatar-status-update"]?.({ avatarStatus: 1 });
        });

        client.addListener(AnamEvent.TALK_ENDED, () => {
          console.log("[ANAM] TALK_ENDED event fired!");
          isSpeakingRef.current = false;
          eventHandlerRef.current["avatar-status-update"]?.({ avatarStatus: 0 });
        });

        // Also add listeners for lowercase event names in case the SDK uses them
        client.addListener('session_ready', async () => {
          console.log("[ANAM] session_ready event fired (lowercase)!");
          setIsAnamReady(true);
          updateConnectionState(ConnectionState.AVATAR_READY);
          updateConnectionState(ConnectionState.AVATAR_LOADED);
          updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
          callNativeAppFunction("anamSessionReady");
          
          // Start streaming after session is ready
          try {
            const videoElement = document.getElementById('anam-avatar-video');
            if (videoElement && !isStreamingStarted) {
              await client.streamToVideoAndAudioElements(videoElement.id);
              setIsStreamingStarted(true);
              console.log("[ANAM] Started streaming after session_ready");
            }
          } catch (error) {
            console.error("[ANAM] Failed to start streaming after session_ready:", error);
          }
        });

        setAnamClient(client);
      } catch (error) {
        console.error("[ANAM] Failed to create Anam client:", error);
        showToast("Failed to initialize Anam client", error.message, true);
      }
    }
  }, [anamSessionToken, anamClient, updateConnectionState, showToast, isStreamingStarted]);

  // Function to send message to Anam avatar
  const sendMessageToAvatar = useCallback(async (message) => {
    if (!message || typeof message !== 'string') return false;
    
    if (!anamClient || !isAnamReady) {
      console.warn("[ANAM] Avatar not ready, skipping message:", message);
      return false;
    }

    // Don't send a new message if avatar is currently speaking
    if (isSpeakingRef.current) {
      console.log("[ANAM] Avatar is speaking, skipping message:", message);
      return false;
    }

    console.log("[ANAM] Sending message to avatar:", message);
    
    try {
      await anamClient.talk(message);
      console.log("[ANAM] Message sent successfully");
      return true;
    } catch (error) {
      console.error("[ANAM] Failed to send message:", error);
      
      // If the error is about not streaming, try to fix it
      if (error.message && error.message.includes('not currently streaming')) {
        console.log("[ANAM] Attempting to fix streaming state...");
        try {
          const videoElement = document.getElementById('anam-avatar-video');
          if (videoElement) {
            await anamClient.streamToVideoAndAudioElements(videoElement.id);
            setIsStreamingStarted(true);
            console.log("[ANAM] Re-streamed to video element, retrying talk...");
            
            // Retry the talk command
            await anamClient.talk(message);
            console.log("[ANAM] Message sent successfully after re-stream");
            return true;
          }
        } catch (retryError) {
          console.error("[ANAM] Failed to fix streaming state:", retryError);
        }
      }
      return false;
    }
  }, [anamClient, isAnamReady]);

  // Process message and handle any commands
  const processAndSendMessageToAvatar = useCallback((message, contextId = "") => {
    // For Anam, we just send the plain text without processing commands
    // Remove any HTML tags or special formatting
    const cleanMessage = message.replace(/<[^>]*>/g, '').trim();
    
    if (cleanMessage) {
      sendMessageToAvatar(cleanMessage);
    }
    return cleanMessage;
  }, [sendMessageToAvatar]);

  const resetAvatarToDefault = useCallback(() => {
    // Stop any ongoing speech
    if (anamClient && isAnamReady) {
      isSpeakingRef.current = false;
      console.log("[ANAM] Avatar reset triggered");
    }
  }, [anamClient, isAnamReady]);

  const connectAvatar = useCallback(async () => {
    console.log("[ANAM] connectAvatar called:", {
      hasAnamClient: !!anamClient,
      sessionStarted,
      isAnamReady
    });

    if (anamClient && !sessionStarted) {
      updateConnectionState(ConnectionState.AVATAR_WS_CONNECTING);
      try {
        console.log("[ANAM] Starting Anam session...");
        setSessionStarted(true);
        // Start the session first
        const sessionResult = await anamClient.startSession();
        console.log("[ANAM] Anam session started successfully:", sessionResult);
        
        // Start streaming immediately after session starts
        try {
          const videoElement = document.getElementById('anam-avatar-video');
          if (videoElement && !isStreamingStarted) {
            console.log("[ANAM] Attempting to stream to video element...");
            await anamClient.streamToVideoAndAudioElements(videoElement.id);
            setIsStreamingStarted(true);
            console.log("[ANAM] Streaming started successfully after session start");
          }
        } catch (streamError) {
          console.error("[ANAM] Failed to start streaming after session start:", streamError);
        }
        
        // If SESSION_READY event doesn't fire, set ready state after a delay
        setTimeout(() => {
          if (!isAnamReady) {
            console.log("[ANAM] SESSION_READY event didn't fire, manually setting avatar as ready");
            setIsAnamReady(true);
            updateConnectionState(ConnectionState.AVATAR_READY);
            updateConnectionState(ConnectionState.AVATAR_LOADED);
            updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
          }
        }, 1000);
        
      } catch (error) {
        console.error("[ANAM] Failed to start Anam session:", error);
        setSessionStarted(false);
        setIsStreamingStarted(false);
        showToast("Avatar Connection Failed", error.message, true);
        updateConnectionState(ConnectionState.AVATAR_WS_DISCONNECT);
      }
    } else if (sessionStarted) {
      console.log("[ANAM] Session already started, skipping...");
      // Session already started, just update state
      updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
    }
  }, [anamClient, sessionStarted, isAnamReady, isStreamingStarted, updateConnectionState, showToast]);

  const disconnectAvatar = useCallback(() => {
    if (anamClient) {
      try {
        // According to docs, the method is stopStreaming()
        anamClient.stopStreaming();
      } catch (error) {
        console.error("[ANAM] Error stopping Anam streaming:", error);
      }
      setIsAnamReady(false);
      setSessionStarted(false);
      setIsStreamingStarted(false);
      isSpeakingRef.current = false;
      updateConnectionState(ConnectionState.AVATAR_WS_DISCONNECT);
    }
  }, [anamClient, updateConnectionState]);

  // Remove the useEffect for handling talk ended since we're not using a queue anymore
  
  return {
    anamClient,
    isAnamReady,
    sendMessageToAvatar,
    processAndSendMessageToAvatar,
    resetAvatarToDefault,
    connectAvatar,
    disconnectAvatar
  };
}