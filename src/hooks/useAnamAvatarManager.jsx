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
  const messageQueueRef = useRef([]);
  const isProcessingRef = useRef(false);

  const eventHandlerRef = useRef();
  eventHandlerRef.current = eventHandler;

  // Process message queue
  const processMessageQueue = useCallback(() => {
    if (isProcessingRef.current || messageQueueRef.current.length === 0) {
      return;
    }

    const nextMessage = messageQueueRef.current.shift();
    isProcessingRef.current = true;

    if (anamClient && isAnamReady) {
      console.log("Sending message to Anam avatar:", nextMessage);
      
      // According to docs, the method is talk()
      anamClient.talk(nextMessage)
        .then(() => {
          console.log("Message sent successfully to Anam");
        })
        .catch((error) => {
          console.error("Failed to send message to Anam:", error);
          isProcessingRef.current = false;
          // Try next message
          processMessageQueue();
        });
    } else {
      console.warn("Anam client not ready, queuing message");
      // Put message back at front of queue
      messageQueueRef.current.unshift(nextMessage);
      isProcessingRef.current = false;
    }
  }, [anamClient, isAnamReady]);

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
        client.addListener(AnamEvent.SESSION_READY, () => {
          console.log("Anam SESSION_READY event fired!");
          setIsAnamReady(true);
          updateConnectionState(ConnectionState.AVATAR_READY);
          updateConnectionState(ConnectionState.AVATAR_LOADED);
          updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
          callNativeAppFunction("anamSessionReady");
        });

        client.addListener(AnamEvent.CONNECTION_CLOSED, () => {
          console.log("Anam CONNECTION_CLOSED event fired!");
          setIsAnamReady(false);
          updateConnectionState(ConnectionState.AVATAR_WS_DISCONNECT);
          callNativeAppFunction("anamConnectionClosed");
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
          // Process next message in queue
          processMessageQueue();
        });

        // Also add listeners for lowercase event names in case the SDK uses them
        client.addListener('session_ready', () => {
          console.log("Anam session_ready event fired (lowercase)!");
          setIsAnamReady(true);
          updateConnectionState(ConnectionState.AVATAR_READY);
          updateConnectionState(ConnectionState.AVATAR_LOADED);
          updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
          callNativeAppFunction("anamSessionReady");
        });

        setAnamClient(client);
      } catch (error) {
        console.error("Failed to create Anam client:", error);
        showToast("Failed to initialize Anam client", error.message, true);
      }
    }
  }, [anamSessionToken, anamClient, updateConnectionState, showToast, processMessageQueue]);

  // Handle talk ended to process queue
  useEffect(() => {
    if (anamClient) {
      const handleTalkEnded = () => {
        isProcessingRef.current = false;
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
        // Start the session first
        const sessionResult = await anamClient.startSession();
        console.log("Anam session started successfully:", sessionResult);
        
        // If SESSION_READY event doesn't fire, set ready state after a delay
        setTimeout(() => {
          if (!isAnamReady) {
            console.log("SESSION_READY event didn't fire, manually setting avatar as ready");
            setIsAnamReady(true);
            updateConnectionState(ConnectionState.AVATAR_READY);
            updateConnectionState(ConnectionState.AVATAR_LOADED);
            updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
          }
        }, 1000);
        
      } catch (error) {
        console.error("Failed to start Anam session:", error);
        setSessionStarted(false);
        showToast("Avatar Connection Failed", error.message, true);
        updateConnectionState(ConnectionState.AVATAR_WS_DISCONNECT);
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
      messageQueueRef.current = [];
      isProcessingRef.current = false;
      updateConnectionState(ConnectionState.AVATAR_WS_DISCONNECT);
    }
  }, [anamClient, updateConnectionState]);

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