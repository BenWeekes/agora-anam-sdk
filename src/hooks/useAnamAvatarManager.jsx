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
  const messageQueueRef = useRef([]);
  const isProcessingRef = useRef(false);
  const sessionReadyTimeoutRef = useRef(null);

  const eventHandlerRef = useRef();
  eventHandlerRef.current = eventHandler;

  // Process message queue
  const processMessageQueue = useCallback(async () => {
    if (isProcessingRef.current || messageQueueRef.current.length === 0) {
      return;
    }

    const nextMessage = messageQueueRef.current.shift();
    isProcessingRef.current = true;

    if (anamClient && isAnamReady) {
      console.log("Sending message to Anam avatar:", nextMessage);
      
      try {
        // Try to send the message
        await anamClient.talk(nextMessage);
        console.log("Message sent successfully to Anam");
        // Don't reset isProcessingRef here - let TALK_ENDED event handle it
      } catch (error) {
        console.error("Failed to send message to Anam:", error);
        
        // If the error is about not streaming, try to fix it
        if (error.message && error.message.includes('not currently streaming')) {
          console.log("Attempting to fix streaming state...");
          try {
            // Some Anam SDK versions might need to call stream() directly
            if (anamClient.stream && typeof anamClient.stream === 'function') {
              await anamClient.stream();
              console.log("Called stream() method, retrying talk...");
              
              // Retry the talk command
              await anamClient.talk(nextMessage);
              console.log("Message sent successfully after stream fix");
              // Don't reset isProcessingRef here - let TALK_ENDED event handle it
            } else {
              // If no stream method, try re-streaming to video element
              const videoElement = document.getElementById('anam-avatar-video');
              if (videoElement && !isStreamingStarted) {
                await anamClient.streamToVideoAndAudioElements(videoElement.id);
                setIsStreamingStarted(true);
                console.log("Re-streamed to video element, retrying talk...");
                
                // Retry the talk command
                await anamClient.talk(nextMessage);
                console.log("Message sent successfully after re-stream");
                // Don't reset isProcessingRef here - let TALK_ENDED event handle it
              }
            }
          } catch (retryError) {
            console.error("Failed to fix streaming state:", retryError);
            isProcessingRef.current = false;
            // Put message back in queue to try later
            messageQueueRef.current.unshift(nextMessage);
            return;
          }
        } else {
          isProcessingRef.current = false;
          // Try next message immediately
          processMessageQueue();
        }
      }
    } else {
      console.warn("Anam client not ready, queuing message");
      // Put message back at front of queue
      messageQueueRef.current.unshift(nextMessage);
      isProcessingRef.current = false;
    }
  }, [anamClient, isAnamReady, isStreamingStarted]);

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
              console.log("Started streaming after SESSION_READY");
            }
          } catch (error) {
            console.error("Failed to start streaming after SESSION_READY:", error);
          }
        });

        client.addListener(AnamEvent.CONNECTION_CLOSED, () => {
          console.log("Anam CONNECTION_CLOSED event fired!");
          setIsAnamReady(false);
          setIsStreamingStarted(false);
          updateConnectionState(ConnectionState.AVATAR_WS_DISCONNECT);
          callNativeAppFunction("anamConnectionClosed");
          
          // Clear message queue when connection is closed
          messageQueueRef.current = [];
          isProcessingRef.current = false;
          
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
          isProcessingRef.current = false;
          // Process next message in queue immediately
          processMessageQueue();
        });

        // Also add listeners for lowercase event names in case the SDK uses them
        client.addListener('session_ready', async () => {
          console.log("Anam session_ready event fired (lowercase)!");
          
          // Clear the timeout since event fired
          if (sessionReadyTimeoutRef.current) {
            clearTimeout(sessionReadyTimeoutRef.current);
            sessionReadyTimeoutRef.current = null;
          }
          
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
              console.log("Started streaming after session_ready");
            }
          } catch (error) {
            console.error("Failed to start streaming after session_ready:", error);
          }
        });

        setAnamClient(client);
      } catch (error) {
        console.error("Failed to create Anam client:", error);
        showToast("Failed to initialize Anam client", error.message, true);
      }
    }
  }, [anamSessionToken, anamClient, updateConnectionState, showToast, processMessageQueue, isStreamingStarted]);

  // Handle talk ended to process queue
  useEffect(() => {
    if (anamClient) {
      const handleTalkEnded = () => {
        console.log("TALK_ENDED event received, resetting processing flag");
        isProcessingRef.current = false;
        // Process next message immediately
        processMessageQueue();
      };

      anamClient.addListener(AnamEvent.TALK_ENDED, handleTalkEnded);
      
      return () => {
        anamClient.removeListener(AnamEvent.TALK_ENDED, handleTalkEnded);
      };
    }
  }, [anamClient, processMessageQueue]);

  // Function to send message to Anam avatar
  const sendMessageToAvatar = useCallback((message) => {
    if (!message || typeof message !== 'string') return false;

    console.log("Queueing message for Anam avatar:", message);
    messageQueueRef.current.push(message);
    
    // If not currently processing, start processing queue
    if (!isProcessingRef.current) {
      processMessageQueue();
    }

    return true;
  }, [processMessageQueue]);

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
      messageQueueRef.current = []; // Clear message queue
      isProcessingRef.current = false;
      console.log("Avatar reset triggered");
    }
  }, [anamClient, isAnamReady]);

  const connectAvatar = useCallback(async () => {
    if (anamClient && !sessionStarted) {
      updateConnectionState(ConnectionState.AVATAR_WS_CONNECTING);
      try {
        console.log("Starting Anam session...");
        setSessionStarted(true);
        
        // Set a shorter timeout for SESSION_READY event (reduced from 1000ms to 500ms)
        sessionReadyTimeoutRef.current = setTimeout(() => {
          if (!isAnamReady) {
            console.log("SESSION_READY event didn't fire within 500ms, manually setting avatar as ready");
            setIsAnamReady(true);
            updateConnectionState(ConnectionState.AVATAR_READY);
            updateConnectionState(ConnectionState.AVATAR_LOADED);
            updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
          }
        }, 500); // Reduced timeout for faster connection
        
        // Start the session first
        const sessionResult = await anamClient.startSession();
        console.log("Anam session started successfully:", sessionResult);
        
        // Start streaming immediately after session starts (don't wait for SESSION_READY)
        try {
          const videoElement = document.getElementById('anam-avatar-video');
          if (videoElement && !isStreamingStarted) {
            console.log("Starting streaming immediately after session start...");
            await anamClient.streamToVideoAndAudioElements(videoElement.id);
            setIsStreamingStarted(true);
            console.log("Started streaming immediately after session start");
            
            // If streaming succeeds, we can consider the avatar ready
            if (!isAnamReady) {
              console.log("Streaming started successfully, setting avatar as ready");
              setIsAnamReady(true);
              updateConnectionState(ConnectionState.AVATAR_READY);
              updateConnectionState(ConnectionState.AVATAR_LOADED);
              updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
              
              // Clear the timeout since we're ready
              if (sessionReadyTimeoutRef.current) {
                clearTimeout(sessionReadyTimeoutRef.current);
                sessionReadyTimeoutRef.current = null;
              }
            }
          }
        } catch (streamError) {
          console.error("Failed to start streaming after session start:", streamError);
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
  }, [anamClient, sessionStarted, isAnamReady, isStreamingStarted, updateConnectionState, showToast]);

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
      messageQueueRef.current = [];
      isProcessingRef.current = false;
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