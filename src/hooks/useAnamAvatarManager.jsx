import { useCallback, useRef, useState, useEffect } from "react";
import { createClient } from "@anam-ai/js-sdk";
import { AnamEvent } from "@anam-ai/js-sdk";
import { callNativeAppFunction } from "../utils/nativeBridge";
import { ConnectionState } from "../utils/connectionState";

export default function useAnamAvatarManager({
  showToast,
  updateConnectionState,
  anamSessionToken,
  eventHandler = {}
}) {
  const [anamClient, setAnamClient] = useState(null);
  const [isAnamReady, setIsAnamReady] = useState(false);
  const messageQueueRef = useRef([]);
  const isProcessingRef = useRef(false);

  const eventHandlerRef = useRef();
  eventHandlerRef.current = eventHandler;

  // Initialize Anam client when session token is available
  useEffect(() => {
    if (anamSessionToken && !anamClient) {
      console.log("Initializing Anam client with session token");
      
      const client = createClient(anamSessionToken);
      
      // Set up event listeners
      client.addListener(AnamEvent.SESSION_READY, () => {
        console.log("Anam session ready");
        setIsAnamReady(true);
        updateConnectionState(ConnectionState.AVATAR_READY);
        updateConnectionState(ConnectionState.AVATAR_LOADED);
        callNativeAppFunction("anamSessionReady");
      });

      client.addListener(AnamEvent.CONNECTION_CLOSED, () => {
        console.log("Anam connection closed");
        setIsAnamReady(false);
        updateConnectionState(ConnectionState.AVATAR_WS_DISCONNECT);
        callNativeAppFunction("anamConnectionClosed");
      });

      client.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (messages) => {
        console.log("Anam message history updated:", messages);
        eventHandlerRef.current["message-history-updated"]?.(messages);
      });

      client.addListener(AnamEvent.TALK_STARTED, () => {
        console.log("Anam talk started");
        eventHandlerRef.current["avatar-status-update"]?.({ avatarStatus: 1 });
      });

      client.addListener(AnamEvent.TALK_ENDED, () => {
        console.log("Anam talk ended");
        eventHandlerRef.current["avatar-status-update"]?.({ avatarStatus: 0 });
        // Process next message in queue
        processMessageQueue();
      });

      setAnamClient(client);
    }
  }, [anamSessionToken, anamClient, updateConnectionState]);

  // Process message queue
  const processMessageQueue = useCallback(() => {
    if (isProcessingRef.current || messageQueueRef.current.length === 0) {
      return;
    }

    const nextMessage = messageQueueRef.current.shift();
    isProcessingRef.current = true;

    if (anamClient && isAnamReady) {
      console.log("Sending message to Anam avatar:", nextMessage);
      
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
      return sendMessageToAvatar(cleanMessage);
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
    if (anamClient) {
      updateConnectionState(ConnectionState.AVATAR_WS_CONNECTING);
      try {
        // Start streaming to video element is handled in AnamAvatarView component
        updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
      } catch (error) {
        console.error("Failed to connect Anam avatar:", error);
        showToast("Avatar Connection Failed", error.message, true);
      }
    }
  }, [anamClient, updateConnectionState, showToast]);

  const disconnectAvatar = useCallback(() => {
    if (anamClient) {
      anamClient.stopStreaming();
      setIsAnamReady(false);
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