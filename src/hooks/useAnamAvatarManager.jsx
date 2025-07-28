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
  const sessionReadyTimeoutRef = useRef(null);

  const eventHandlerRef = useRef();
  eventHandlerRef.current = eventHandler;

  // Initialize Anam client when session token is available
  useEffect(() => {
    if (anamSessionToken && !anamClient) {
      console.log("Initializing Anam client with session token");
      
      try {
        const client = createClient(anamSessionToken);
        
        // Debug: Log the client object and its properties
        console.log("Created Anam client:", client);
        console.log("Client type:", typeof client);
        console.log("Client methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
        console.log("Client properties:", Object.keys(client));
        
        // Check if client has the expected methods
        console.log("Has startSession?", typeof client.startSession === 'function');
        console.log("Has streamToVideoAndAudioElements?", typeof client.streamToVideoAndAudioElements === 'function');
        console.log("Has talk?", typeof client.talk === 'function');
        console.log("Has stopStreaming?", typeof client.stopStreaming === 'function');
        
        // Set up event listeners using event names
        client.addListener(AnamEvent.SESSION_READY, async () => {
          console.log("Anam SESSION_READY event fired!");
          
          // Clear the timeout since event fired
          if (sessionReadyTimeoutRef.current) {
            clearTimeout(sessionReadyTimeoutRef.current);
            sessionReadyTimeoutRef.current = null;
          }
          
          // Don't mark as ready yet - wait for streaming to be established
          if (!isStreamingStarted) {
            console.log("SESSION_READY fired but streaming not started yet");
          }
        });

        client.addListener(AnamEvent.CONNECTION_CLOSED, () => {
          console.log("Anam CONNECTION_CLOSED event fired!");
          setIsAnamReady(false);
          setIsStreamingStarted(false);
          setSessionStarted(false);
          updateConnectionState(ConnectionState.AVATAR_WS_DISCONNECT);
          callNativeAppFunction("anamConnectionClosed");
          
          // Clear timeout if still running
          if (sessionReadyTimeoutRef.current) {
            clearTimeout(sessionReadyTimeoutRef.current);
            sessionReadyTimeoutRef.current = null;
          }
        });

        client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (messages) => {
          console.log("Anam MESSAGE_HISTORY_UPDATED event fired!", messages);
          eventHandlerRef.current["message-history-updated"]?.(messages);
        });

        client.addListener(AnamEvent.TALK_STARTED, () => {
          console.log("Anam TALK_STARTED event fired!");
          eventHandlerRef.current["avatar-status-update"]?.({ avatarStatus: 1 });
        });

        client.addListener(AnamEvent.TALK_ENDED, () => {
          console.log("Anam TALK_ENDED event fired!");
          eventHandlerRef.current["avatar-status-update"]?.({ avatarStatus: 0 });
        });

        // Also add listeners for lowercase event names in case the SDK uses them
        client.addListener('session_ready', async () => {
          console.log("Anam session_ready event fired (lowercase)!");
          
          // Clear the timeout since event fired
          if (sessionReadyTimeoutRef.current) {
            clearTimeout(sessionReadyTimeoutRef.current);
            sessionReadyTimeoutRef.current = null;
          }
          
          // Don't mark as ready yet - wait for streaming to be established
          if (!isStreamingStarted) {
            console.log("session_ready fired but streaming not started yet");
          }
        });

        setAnamClient(client);
      } catch (error) {
        console.error("Failed to create Anam client:", error);
        showToast("Failed to initialize Anam client", error.message, true);
      }
    }
  }, [anamSessionToken, anamClient, updateConnectionState, showToast]);

  // Function to send message to Anam avatar - DIRECT, no queue
  const sendMessageToAvatar = useCallback(async (message) => {
    if (!message || typeof message !== 'string') return false;

    // Only send if avatar is fully ready
    if (!anamClient || !isAnamReady || !sessionStarted || !isStreamingStarted) {
      console.warn("Cannot send message to Anam - avatar not ready:", {
        hasClient: !!anamClient,
        isReady: isAnamReady,
        sessionStarted,
        isStreamingStarted
      });
      return false;
    }

    console.log("Sending message directly to Anam avatar:", message);
    
    try {
      await anamClient.talk(message);
      console.log("Message sent successfully to Anam");
      return true;
    } catch (error) {
      console.error("Failed to send message to Anam:", error);
      
      // If we get specific errors, it means avatar isn't ready despite our checks
      if (error.message && (error.message.includes('session is not started') || 
          error.message.includes('peer connection is null') ||
          error.message.includes('not currently streaming'))) {
        console.error("Avatar state inconsistent - marking as not ready");
        setIsAnamReady(false);
      }
      
      return false;
    }
  }, [anamClient, isAnamReady, sessionStarted, isStreamingStarted]);

  // Process message and handle any commands
  const processAndSendMessageToAvatar = useCallback((message, contextId = "") => {
    // For Anam, we just send the plain text without processing commands
    // Remove any HTML tags or special formatting
    const cleanMessage = message.replace(/<[^>]*>/g, '').trim();
    if (cleanMessage) {
      // Send directly, don't queue
      sendMessageToAvatar(cleanMessage);
    }
    return cleanMessage;
  }, [sendMessageToAvatar]);

  const resetAvatarToDefault = useCallback(() => {
    // Stop any ongoing speech
    if (anamClient && isAnamReady) {
      console.log("Avatar reset triggered");
    }
  }, [anamClient, isAnamReady]);

  const connectAvatar = useCallback(async () => {
    if (anamClient && !sessionStarted) {
      updateConnectionState(ConnectionState.AVATAR_WS_CONNECTING);
      try {
        console.log("Starting Anam session...");
        setSessionStarted(true);
        
        // Start the session first
        const sessionResult = await anamClient.startSession();
        console.log("Anam session started successfully:", sessionResult);
        
        // Start streaming immediately after session starts
        try {
          const videoElement = document.getElementById('anam-avatar-video');
          if (videoElement) {
            console.log("Starting streaming immediately after session start...");
            await anamClient.streamToVideoAndAudioElements(videoElement.id);
            setIsStreamingStarted(true);
            console.log("Started streaming immediately after session start");
            
            // Now that both session and streaming are ready, mark avatar as ready
            console.log("Both session and streaming ready, marking avatar as ready");
            setIsAnamReady(true);
            updateConnectionState(ConnectionState.AVATAR_READY);
            updateConnectionState(ConnectionState.AVATAR_LOADED);
            updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
            callNativeAppFunction("anamSessionReady");
            
            // Clear any pending timeout
            if (sessionReadyTimeoutRef.current) {
              clearTimeout(sessionReadyTimeoutRef.current);
              sessionReadyTimeoutRef.current = null;
            }
          }
        } catch (streamError) {
          console.error("Failed to start streaming after session start:", streamError);
          // Even if streaming fails, we might still be able to use the avatar
          // Set a timeout to mark as ready anyway
          sessionReadyTimeoutRef.current = setTimeout(() => {
            if (!isAnamReady) {
              console.log("Streaming failed but marking avatar as ready anyway");
              setIsAnamReady(true);
              updateConnectionState(ConnectionState.AVATAR_READY);
              updateConnectionState(ConnectionState.AVATAR_LOADED);
              updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
              callNativeAppFunction("anamSessionReady");
            }
          }, 1000);
        }
        
      } catch (error) {
        console.error("Failed to start Anam session:", error);
        setSessionStarted(false);
        setIsStreamingStarted(false);
        showToast("Avatar Connection Failed", error.message, true);
        updateConnectionState(ConnectionState.AVATAR_WS_DISCONNECT);
        
        // Clear timeout on error
        if (sessionReadyTimeoutRef.current) {
          clearTimeout(sessionReadyTimeoutRef.current);
          sessionReadyTimeoutRef.current = null;
        }
      }
    } else if (sessionStarted) {
      console.log("Session already started, skipping...");
      // Session already started, just update state
      updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
    }
  }, [anamClient, sessionStarted, isAnamReady, updateConnectionState, showToast]);

  const disconnectAvatar = useCallback(() => {
    if (anamClient) {
      try {
        // According to docs, the method is stopStreaming()
        anamClient.stopStreaming();
      } catch (error) {
        console.error("Error stopping Anam streaming:", error);
      }
      setIsAnamReady(false);
      setSessionStarted(false);
      setIsStreamingStarted(false);
      updateConnectionState(ConnectionState.AVATAR_WS_DISCONNECT);
      
      // Clear timeout on disconnect
      if (sessionReadyTimeoutRef.current) {
        clearTimeout(sessionReadyTimeoutRef.current);
        sessionReadyTimeoutRef.current = null;
      }
    }
  }, [anamClient, updateConnectionState]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (sessionReadyTimeoutRef.current) {
        clearTimeout(sessionReadyTimeoutRef.current);
      }
    };
  }, []);

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