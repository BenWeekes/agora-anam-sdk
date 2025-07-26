import { useState, useCallback, useEffect, useRef } from 'react';
import { handleRtmMessage, initRtmClient } from "../utils/rtmUtils";
import { ConnectionState } from "../utils/connectionState";

/**
 * Custom hook for managing Agora RTM (Real-Time Messaging) functionality
 */
export function useAgoraRTM({
  agoraConfig,
  derivedChannelName,
  updateConnectionState,
  urlParams,
  processAndSendMessageToAvatar,
  isFullyConnected // Add this parameter to track full connection state
}) {
  const [rtmClient, setRtmClient] = useState(null);
  const [rtmMessages, setRtmMessages] = useState([]);
  const directSendFunctionRef = useRef(null)

  // Avatar status tracking
  const prevAvatarStatusRef = useRef(null);
  const continueMessageTimeoutRef = useRef(null);
  const sentContinueMessagesRef = useRef(new Set()); // Track sent continue messages

  // Always use derivedChannelName for RTM login - this never changes
  const getLoginChannelName = useCallback(() => {
    console.log("[RTM] getLoginChannelName returning:", derivedChannelName);
    return derivedChannelName;
  }, [derivedChannelName]);

  // Message destination channel - this switches based on connection state
  const getMessageChannelName = useCallback(() => {
    // If we're in purechat mode and not fully connected, use "purechat"
    // Otherwise, use the derivedChannelName
    const shouldUsePurechat = urlParams.purechat && !isFullyConnected;
    const result = shouldUsePurechat ? "purechat" : derivedChannelName;
    
    console.log("[RTM] getMessageChannelName decision:", {
      purechatMode: urlParams.purechat,
      isFullyConnected,
      shouldUsePurechat,
      derivedChannelName,
      result
    });
    
    return result;
  }, [urlParams.purechat, derivedChannelName, isFullyConnected]);

  // Getter for direct send function to avoid dependency issues
  const getDirectSendRtmMessage = useCallback(() => directSendFunctionRef.current, []);

  // Register direct RTM message send function
  const registerDirectRtmSend = useCallback((sendFunction) => {
    directSendFunctionRef.current = sendFunction
    console.log("[RTM] Registered direct RTM send function");
  }, []);

  // Check if a message is a continue message that we sent
  const isContinueMessage = useCallback((messageText) => {
    if (!urlParams.continue || !messageText) return false;
    
    // Check if this message matches our continue parameter
    const isContinue = messageText.trim() === urlParams.continue.trim();
    
    // If it's a continue message and we have sent it, mark it for filtering
    if (isContinue && sentContinueMessagesRef.current.has(messageText.trim())) {
      console.log("[RTM] Filtering out continue message that we sent:", messageText);
      return true;
    }
    
    return false;
  }, [urlParams.continue]);

  // RTM message handler wrapper
  const handleRtmMessageCallback = useCallback(
    (event) => {
      console.warn('[RTM] handleRtmMessageCallback', event);
      
      // Filter out continue messages before processing
      const { message, messageType, publisher } = event;
      const isFromAgent = publisher !== String(agoraConfig.uid);
      
      // Check if this is a continue message we should filter
      if (isFromAgent && messageType === "STRING") {
        try {
          // Try to parse as JSON first
          let messageText = message;
          try {
            const parsedMsg = JSON.parse(message);
            if (parsedMsg.text !== undefined) {
              messageText = parsedMsg.text;
            }
          } catch {
            // Not JSON, use message as is
          }
          
          // Check if this is a continue message we sent
          if (isContinueMessage(messageText)) {
            console.log("[RTM] Filtered out continue message from chat history:", messageText);
            return; // Don't process this message
          }
        } catch (error) {
          console.error("[RTM] Error checking continue message:", error);
        }
      }
      
      // In purechat mode AND not fully connected, don't process commands through the avatar
      const shouldProcessCommands = !(urlParams.purechat && !isFullyConnected);
      const messageProcessor = shouldProcessCommands ? processAndSendMessageToAvatar : null;
      
      console.log("[RTM] Message processing config:", {
        purechat: urlParams.purechat,
        isFullyConnected,
        shouldProcessCommands,
        hasMessageProcessor: !!messageProcessor
      });
      
      handleRtmMessage(event, agoraConfig.uid, setRtmMessages, messageProcessor);
    },
    [agoraConfig.uid, processAndSendMessageToAvatar, urlParams.purechat, isFullyConnected, isContinueMessage]
  );

  window.clearContinueMessageTimeout = () => {
    if (continueMessageTimeoutRef.current) {
      console.warn("[RTM] Clearing continue message timeout via global function");
      clearTimeout(continueMessageTimeoutRef.current);
      continueMessageTimeoutRef.current = null;
    }
  };

  // Clean up RTM when component unmounts
  useEffect(() => {
    return () => {
      if (continueMessageTimeoutRef.current) {
        clearTimeout(continueMessageTimeoutRef.current);
      }
      delete window.clearContinueMessageTimeout;
    };
  }, []);

  // Connect to Agora RTM
  const connectToRtm = useCallback(async (token, uid, silentMode = false) => {
    if (!silentMode) {
      updateConnectionState(ConnectionState.RTM_CONNECTING);
    }
    
    try {
      // Always use derivedChannelName for login
      const loginChannelName = getLoginChannelName();
      console.log(`[RTM] Connecting to RTM with login channel: ${loginChannelName}`);
      
      const rtmClientInstance = await initRtmClient(
        agoraConfig.appId,
        uid,
        token,
        loginChannelName, // This is always derivedChannelName
        handleRtmMessageCallback
      );

      if (rtmClientInstance) {
        setRtmClient(rtmClientInstance);
        if (!silentMode) {
          updateConnectionState(ConnectionState.RTM_CONNECTED);
        }
        console.log("[RTM] Successfully connected to RTM");
        return rtmClientInstance;
      }
      
      return null;
    } catch (error) {
      console.error("[RTM] Error connecting to Agora RTM:", error);
      if (!silentMode) {
        updateConnectionState(ConnectionState.RTM_DISCONNECT);
      }
      return null;
    }
  }, [agoraConfig.appId, getLoginChannelName, handleRtmMessageCallback, updateConnectionState]);

  // Disconnect from Agora RTM
  const disconnectFromRtm = useCallback(async () => {
    if (rtmClient) {
      try {
        const loginChannelName = getLoginChannelName();
        rtmClient.removeEventListener("message", handleRtmMessageCallback);
        await rtmClient.unsubscribe(loginChannelName);
        await rtmClient.logout();
        setRtmClient(null);
        updateConnectionState(ConnectionState.RTM_DISCONNECT);
        setRtmMessages([]);
        directSendFunctionRef.current = null;
        prevAvatarStatusRef.current = null;
        sentContinueMessagesRef.current.clear(); // Clear continue message tracking

        // Clear any scheduled continue message
        if (continueMessageTimeoutRef.current) {
          clearTimeout(continueMessageTimeoutRef.current);
          continueMessageTimeoutRef.current = null;
        }
        
        console.log("[RTM] Successfully disconnected from RTM");
      } catch (error) {
        console.error("[RTM] Error disconnecting from RTM:", error);
      }
    }
  }, [rtmClient, getLoginChannelName, handleRtmMessageCallback, updateConnectionState]);

  // Add a message to the RTM messages array
  const addRtmMessage = useCallback((message) => {
    setRtmMessages(prevMessages => [...prevMessages, message]);
  }, []);

  const handleContinueParamOnAvatarStatus = useCallback((resp) => {
    console.log("[RTM] handleContinueParamOnAvatarStatus called with:", {
      avatarStatus: resp.avatarStatus,
      purechat: urlParams.purechat,
      continueParam: urlParams.continue,
      isFullyConnected,
      derivedChannelName
    });

    const previousStatus = prevAvatarStatusRef.current?.avatarStatus;
    const continueParam = urlParams.continue;
    const continueDelay = urlParams.continueDelay;
    const hasSeenContinue = prevAvatarStatusRef.current?.continueSent || false;

    if (continueMessageTimeoutRef.current) {
      console.warn("[RTM] Clearing existing continue message timeout");
      clearTimeout(continueMessageTimeoutRef.current);
    }

    const transitionedToIdle = previousStatus === 1 && resp.avatarStatus === 0;
    
    console.log("[RTM] Avatar status transition check:", {
      previousStatus,
      currentStatus: resp.avatarStatus,
      transitionedToIdle,
      hasContinueParam: !!continueParam,
      continueDelay
    });
    
    // Check if continueDelay is -1, which means don't send continue messages
    if (continueDelay === -1) {
      console.log("[RTM] Continue delay is -1, not sending continue messages (but will still filter them)");
      // Store the avatar status without scheduling continue message
      prevAvatarStatusRef.current = {
        ...(prevAvatarStatusRef.current || {}),
        avatarStatus: resp.avatarStatus
      };
      return;
    }
    
    if (transitionedToIdle && continueParam) {
      console.warn("[RTM] Scheduling continue message after status transition");
      
      // Use continueDelay from URL params, fallback to original logic
      let timeoutDuration;
      if (continueDelay !== null && continueDelay !== undefined) {
        timeoutDuration = continueDelay;
        console.warn(`[RTM] Using continue delay from URL parameter: ${timeoutDuration}ms`);
      } else {
        // Original logic: 200ms for first timeout, 3000ms for subsequent ones
        timeoutDuration = hasSeenContinue ? 3000 : 200;
        console.warn(`[RTM] Using default timeout duration: ${timeoutDuration}ms (${hasSeenContinue ? 'subsequent' : 'first'} time)`);
      }
      
      continueMessageTimeoutRef.current = setTimeout(() => {
        const sendDirect = getDirectSendRtmMessage();
        console.log("[RTM] Continue timeout fired, checking sendDirect:", {
          hasSendDirect: !!sendDirect,
          isFullyConnected,
          currentMessageChannel: getMessageChannelName(),
          derivedChannelName
        });
        
        if (sendDirect) {
          // Track that we're sending this continue message
          sentContinueMessagesRef.current.add(continueParam.trim());
          
          // For continue messages when avatar is connected, always use the derivedChannelName
          // This ensures continue messages go to the agent, not to "purechat"
          const messageChannel = derivedChannelName;
          console.warn(`[RTM] Sending continue message to channel: ${messageChannel} (using derivedChannelName directly)`);
          console.warn("[RTM] Continue message content:", continueParam);
          
          sendDirect(continueParam, true, messageChannel)
            .then(success => {
              console.warn("[RTM] Continue message sent successfully:", success);
              // Mark that we've sent the continue message
              prevAvatarStatusRef.current = { 
                ...prevAvatarStatusRef.current,
                continueSent: true 
              };
            })
            .catch(err => {
              console.error("[RTM] Continue message error:", err);
              // Remove from sent tracking on error
              sentContinueMessagesRef.current.delete(continueParam.trim());
            });
        } else {
          console.error("[RTM] Direct send function unavailable");
        }
        continueMessageTimeoutRef.current = null;
      }, timeoutDuration);
    }

    // Store the avatar status
    prevAvatarStatusRef.current = {
      ...(prevAvatarStatusRef.current || {}),
      avatarStatus: resp.avatarStatus
    };
    
    console.log("[RTM] Updated avatar status ref:", prevAvatarStatusRef.current);
  }, [getDirectSendRtmMessage, derivedChannelName, urlParams, isFullyConnected, getMessageChannelName]);

  return {
    rtmClient,
    rtmMessages,
    getDirectSendRtmMessage,
    registerDirectRtmSend,
    connectToRtm,
    disconnectFromRtm,
    addRtmMessage,
    setRtmMessages,
    handleContinueParamOnAvatarStatus,
    // Expose the message channel name function for use in components
    getMessageChannelName
  };
}