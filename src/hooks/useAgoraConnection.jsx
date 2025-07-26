import { useState, useCallback, useRef } from 'react';
import { ConnectionState } from "../utils/connectionState";
import { useAgoraRTC } from './useAgoraRTC';
import { useAgoraRTM } from './useAgoraRTM';
import Logger from '../utils/logger';

/**
 * Hook that combines Agora RTC and RTM functionality for a complete connection management
 * Modified to include Anam session token handling
 */
export function useAgoraConnection({
  agoraConfig,
  setAgoraConfig,
  derivedChannelName,
  agentEndpoint,
  updateConnectionState,
  processAndSendMessageToAvatar,
  showToast,
  agoraClientRef,
  urlParams,
  isFullyConnected,
  setAnamSessionToken // New prop for setting Anam session token
}) {
  const [agentId, setAgentId] = useState(null);
  const abortControllerRef = useRef(null);
  const isEndpointConnectedRef = useRef(false);
  const agentEndpointRef = useRef(agentEndpoint);
  agentEndpointRef.current = agentEndpoint;
  
  // Initialize Agora RTC hook (modified for no audio subscription)
  const agoraRTC = useAgoraRTC({
    agoraConfig,
    derivedChannelName,
    updateConnectionState,
    showToast,
    agoraClientRef
  });
  
  // Initialize Agora RTM hook
  const agoraRTM = useAgoraRTM({
    agoraConfig,
    derivedChannelName,
    updateConnectionState,
    urlParams,
    processAndSendMessageToAvatar,
    isFullyConnected
  });

  const createAbortController = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current;
  }, []);

  const disconnectAbortController = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  /**
   * Function to communicate with the agent endpoint and get connection tokens
   * Modified to also get Anam session token
   */
  const callAgentEndpoint = useCallback(async (shouldConnectAgent = true, silentMode = false) => {
    try {
      let result = {
        token: agoraConfig.token,
        uid: agoraConfig.uid,
        success: true,
        anamSessionToken: null // Add Anam session token to result
      };
      
      const currentAgentEndpoint = agentEndpointRef.current;
      
      if (!currentAgentEndpoint) {
        return result;
      }
      isEndpointConnectedRef.current = false

      const abortController = createAbortController();
      
      const searchParams = new URLSearchParams({
        channel: derivedChannelName,
      });
      
      if (!shouldConnectAgent) {
        searchParams.append("connect", "false");
      }
      
      // Add optional parameters
      if (agoraConfig.voice_id) {
        searchParams.append("voice_id", agoraConfig.voice_id);
      }
      
      if (agoraConfig.prompt) {
        searchParams.append("prompt", agoraConfig.prompt);
      }
      
      if (agoraConfig.greeting) {
        searchParams.append("greeting", agoraConfig.greeting);
      }
      
      if (agoraConfig.profile) {
        searchParams.append("profile", agoraConfig.profile);
      }

      if (agoraConfig.name) {
        searchParams.append("name", agoraConfig.name);
      }

      let endpointToUse = currentAgentEndpoint;
      if (agoraConfig.endpoint) {        
        endpointToUse = agoraConfig.endpoint;
        console.log(endpointToUse, "Agent endpoint from config");
      }     

      const endpoint = `${endpointToUse}/?${searchParams.toString()}`;
      console.log("Calling agent endpoint:", endpoint);
      
      const response = await fetch(endpoint, {
        signal: abortController.signal,
        method: "GET",
        mode: "cors",
        headers: {
          Accept: "application/json",
        },
      });
      
      isEndpointConnectedRef.current = true;
      const data = await response.json();
      console.log("Agent response:", data);
      
      // Extract agent_id from response
      try {
        if (data.agent_response && data.agent_response.response) {
          const responseObj = JSON.parse(data.agent_response.response);
          if (responseObj.agent_id) {
            setAgentId(responseObj.agent_id);
            console.log("Agent ID:", responseObj.agent_id);
          }
        }
      } catch (e) {
        console.error("Error parsing agent_id:", e);
      }
      
      if (data.agent_response && 
          (data.agent_response.status_code === 200 || data.agent_response.status_code === 409)) {
        
        if (data.user_token) {
          result.token = data.user_token.token || result.token;
          result.uid = data.user_token.uid || result.uid;
        }
        
        // Extract Anam session token if provided
        if (data.anam_session_token) {
          result.anamSessionToken = data.anam_session_token;
          console.log("Received Anam session token from endpoint");
          
          // Set the Anam session token
          if (setAnamSessionToken) {
            setAnamSessionToken(data.anam_session_token);
          }
        }
        
        if (shouldConnectAgent && !silentMode) {
          updateConnectionState(ConnectionState.AGENT_CONNECTED);
        } else if (shouldConnectAgent) {
          updateConnectionState(ConnectionState.AGENT_CONNECTED);
        }
      } else {
        let errorReason = "Unknown error";
        try {
          if (data.agent_response && data.agent_response.response) {
            const responseObj = JSON.parse(data.agent_response.response);
            errorReason = responseObj.reason || responseObj.detail || "Unknown error";
          }
        } catch (e) {
          console.error("Error parsing agent response:", e);
        }
        
        console.error("Error from agent:", data);
        if (!silentMode) {
          showToast("Failed to Connect", errorReason, true);
        }
        result.success = false;
      }
      
      if (data.user_token) {
        result.token = data.user_token.token || result.token;
        result.uid = data.user_token.uid || result.uid;
      }
      
      Logger.log("Agent Endpoint Result: ", result)
      return result;
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("Connection attempt cancelled by hangup or new connection request");
        return { success: false };
      }
      
      console.error("Error calling agent endpoint:", error);
      if (!silentMode) {
        showToast("Failed to Connect", error.message, true);
      }
      return { success: false };
    }
  }, [agoraConfig, derivedChannelName, updateConnectionState, showToast, createAbortController, setAnamSessionToken]);

  const disconnectAgentEndpoint = useCallback(async () => {
    disconnectAbortController()
    setAgentId(null);
    
    const currentAgentEndpoint = agentEndpointRef.current;
    if (currentAgentEndpoint && agentId && isEndpointConnectedRef.current) {
      try {
        const endpoint = `${currentAgentEndpoint}/?hangup=true&agent_id=${agentId}`;
        console.log("Calling hangup endpoint:", endpoint);
        
        const response = await fetch(endpoint, {
          method: "GET",
          mode: "cors",
          headers: {
            Accept: "application/json",
          },
        });
        
        isEndpointConnectedRef.current = false
        const data = await response.json();
        console.log("Hangup response:", data);
        
        if (!(data.agent_response && data.agent_response.success)) {
          let errorReason = "Unknown error";
          try {
            if (data.agent_response && data.agent_response.response) {
              const responseObj = JSON.parse(data.agent_response.response);
              errorReason = responseObj.reason || responseObj.detail || "Unknown error";
            }
          } catch (e) {
            console.error("Error parsing hangup response:", e);
          }
          
          console.log("Hangup response (normal in group calls):", errorReason);
        }
      } catch (error) {
        console.error("Error during hangup:", error);
        console.log("Hangup error (normal in group calls):", error.message);
      }
    }
  }, [agentId, disconnectAbortController])

  // Connect to both Agora services
  const connectToAgora = useCallback(async () => {
    updateConnectionState(ConnectionState.AGORA_CONNECTING);
    updateConnectionState(ConnectionState.AGENT_CONNECTING);
    
    try {
      if (!urlParams.purechat && agoraRTM.rtmClient) {
        console.log("Disconnecting existing RTM connection before full mode connection");
        await agoraRTM.disconnectFromRtm();
      }

      agoraRTC.requestMicrophonePermission()

      // Call agent endpoint to get token, uid, and Anam session token
      const agentResult = await callAgentEndpoint(true);
      if (!agentResult.success) return false;
      
      const { token, uid } = agentResult;
      
      // Update Agora config with token and uid
      setAgoraConfig(prev => ({
        ...prev,
        token: token,
        uid: uid
      }));
      
      let rtmClient = agoraRTM.rtmClient;
      if (!rtmClient) {
        rtmClient = await agoraRTM.connectToRtm(token, uid);
      }
      
      console.log("Connecting to Agora RTC for stream messages, purechat mode:", urlParams.purechat);
      const rtcSuccess = await agoraRTC.connectToAgoraRTC(token, uid);
    
      if (!rtcSuccess || !rtmClient) {
        showToast("Connection Error", "Failed to connect to Agora", true);    
        return false;
      }
    
      return true;
    } catch (error) {
      console.error("General connection error:", error);
      showToast("Connection Error", error.message, true);

      updateConnectionState(ConnectionState.AGORA_DISCONNECT);
      updateConnectionState(ConnectionState.AGENT_DISCONNECT);
      return false;
    }
  }, [
    agoraRTC, 
    agoraRTM, 
    callAgentEndpoint, 
    setAgoraConfig, 
    updateConnectionState, 
    showToast,
    urlParams.purechat
  ]);

  // Connect to RTM only for purechat mode
  const connectToPureChat = useCallback(async () => {
    const maxRetries = 10;
    let retryCount = 0;
    
    const attemptConnection = async () => {
      try {
        const agentResult = await callAgentEndpoint(false, true);
        if (!agentResult.success) {
          throw new Error("Failed to get token");
        }
        
        const { token, uid } = agentResult;
        
        setAgoraConfig(prev => ({
          ...prev,
          token: token,
          uid: uid,
        }));
        
        const rtmClient = await agoraRTM.connectToRtm(token, uid, true);
      
        if (!rtmClient) {
          throw new Error("Failed to connect to RTM");
        }
        
        console.log("Purechat RTM connected silently");
        return true;
      } catch (error) {
        if (error.name === "AbortError") {
          console.log("Purechat connection attempt was cancelled");
          return false;
        }

        console.warn(`Pure chat connection attempt ${retryCount + 1} failed:`, error.message);
        retryCount++;
        
        if (retryCount < maxRetries) {
          console.log(`Retrying pure chat connection in 3 seconds... (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          return attemptConnection();
        } else {
          console.error("Max retries reached for pure chat connection");
          showToast("Connection Error", "Failed to connect to chat after multiple attempts", true);
          return false;
        }
      }
    };
    
    return attemptConnection();
  }, [
    agoraRTM, 
    callAgentEndpoint, 
    setAgoraConfig, 
    showToast
  ]);
  
  // Disconnect from Agora services
  const disconnectFromAgora = useCallback(async () => {
    await agoraRTC.disconnectFromAgoraRTC();
    
    if (!urlParams.purechat) {
      await agoraRTM.disconnectFromRtm();
    }
    
    await disconnectAgentEndpoint()
  }, [agoraRTC, agoraRTM, disconnectAgentEndpoint, urlParams.purechat]);

  return {
    ...agoraRTC,
    ...agoraRTM,
    agentId,
    callAgentEndpoint,
    connectToAgora,
    connectToPureChat,
    disconnectFromAgora,
    handleContinueParamOnAvatarStatus: agoraRTM.handleContinueParamOnAvatarStatus
  };
}