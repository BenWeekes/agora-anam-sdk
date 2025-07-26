import AgoraRTM from "agora-rtm";

/**
 * Initialize and set up an RTM client
 * 
 * @param {string} appId - Agora App ID
 * @param {number|string} uid - User ID
 * @param {string} token - Authentication token
 * @param {string} loginChannelName - Channel to use for login (always derivedChannelName)
 * @param {Function} messageHandler - Callback for RTM messages
 * @returns {Promise<RTMClient|null>} RTM client instance or null on failure
 */
export const initRtmClient = async (appId, uid, token, loginChannelName, messageHandler) => {
  try {
    // Create RTM client - always use derivedChannelName for login
    console.log("RTM Login:", {
      uid: uid,
      loginChannelName: loginChannelName,
      loginString: String(uid + "-" + loginChannelName)
    });
    
    const rtm = new AgoraRTM.RTM(appId, String(uid + "-" + loginChannelName), {
      logLevel: "warn",
    });
    
    // Login to RTM
    await rtm.login({ token });
    
    // Subscribe to the login channel with minimal options
    const subscribeResult = await rtm.subscribe(loginChannelName, {
      withMessage: true,
      withPresence: false,
      beQuiet: false,
      withMetadata: false,
      withLock: false,
    });
    console.log("[RTM] Subscribe Message Channel success:", subscribeResult);
    
    // Store the login channel name for later use
    rtm.loginChannel = loginChannelName;
    
    // Add message event listener
    rtm.addEventListener("message", messageHandler);
    
    return rtm;
  } catch (error) {
    console.error("Failed to initialize RTM client:", error);
    return null;
  }
};

/**
 * Handle incoming RTM messages
 * 
 * @param {Object} event - RTM message event
 * @param {string|number} currentUserId - Current user's ID
 * @param {Function} setRtmMessages - State setter for RTM messages
 * @param {Function} messageProcessor - Optional function to process messages
 * @param {Function} setTypingUsers - Optional function to set typing indicators
 */
export const handleRtmMessage = (event, currentUserId, setRtmMessages, messageProcessor, setTypingUsers = null) => {
  try {
    const { message, messageType, timestamp, publisher } = event;
    
    console.debug("BBB [RTM] Message received (handleRtmMessage):", {
      publisher,
      currentUserId,
      messageType,
      timestamp,
      message: typeof message === 'string' ? message : '[binary data]'
    });
    
    // Determine if the message is from the current user or the agent
    const isFromAgent = publisher !== String(currentUserId);
    
    // Handle string messages (most common)
    if (messageType === "STRING") {
      // First try to parse as JSON
      try {
        const parsedMsg = JSON.parse(message);
        
        // Handle typing indicators
        if (parsedMsg.type === "typing_start" && setTypingUsers) {
          if (isFromAgent) {
            setTypingUsers(prev => new Set([...prev, publisher]));
            
            // Auto-clear typing after 15 seconds
            setTimeout(() => {
              setTypingUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(publisher);
                return newSet;
              });
            }, 15000);
          }
          return; // Don't display typing indicators as messages
        }
        
        // Handle image messages
        if (parsedMsg.img) {
          // Clear typing indicator when real message arrives
          if (setTypingUsers && isFromAgent) {
            setTypingUsers(prev => {
              const newSet = new Set(prev);
              newSet.delete(publisher);
              return newSet;
            });
          }
          
          setRtmMessages(prev => [...prev, {
            type: isFromAgent ? 'agent' : 'user',
            time: timestamp || Date.now(),
            content: parsedMsg.img,
            contentType: 'image',
            userId: publisher,
            isOwn: !isFromAgent
          }]);
          return;
        }
        
        // Handle text messages from JSON
        if (parsedMsg.text !== undefined) {
          // Clear typing indicator when real message arrives
          if (setTypingUsers && isFromAgent) {
            setTypingUsers(prev => {
              const newSet = new Set(prev);
              newSet.delete(publisher);
              return newSet;
            });
          }
          
          // Process message if processor is provided
          let processedText = parsedMsg.text;
          if (messageProcessor && isFromAgent) {
            processedText = messageProcessor(processedText, parsedMsg.turn_id || "");
            
            // If the message was entirely a command, don't display it
            if (processedText === "") {
              return;
            }
          }
          
          setRtmMessages(prev => [...prev, {
            type: isFromAgent ? 'agent' : 'user',
            time: timestamp || Date.now(),
            content: processedText,
            contentType: 'text',
            userId: publisher,
            isOwn: !isFromAgent,
            turn_id: parsedMsg.turn_id
          }]);
          return;
        }
        
        // If we got here, it's JSON but without recognized fields
        // Clear typing indicator for any real message
        if (setTypingUsers && isFromAgent) {
          setTypingUsers(prev => {
            const newSet = new Set(prev);
            newSet.delete(publisher);
            return newSet;
          });
        }
        
        setRtmMessages(prev => [...prev, {
          type: isFromAgent ? 'agent' : 'user',
          time: timestamp || Date.now(),
          content: message, // Use the original string
          contentType: 'text',
          userId: publisher,
          isOwn: !isFromAgent
        }]);
        
      } catch (parseError) {
        // Not valid JSON, treat as plain text
        // Clear typing indicator when real message arrives
        if (setTypingUsers && isFromAgent) {
          setTypingUsers(prev => {
            const newSet = new Set(prev);
            newSet.delete(publisher);
            return newSet;
          });
        }
        
        // Process message if processor is provided
        let processedText = message;
        if (messageProcessor && isFromAgent) {
          processedText = messageProcessor(processedText);
          
          // If the message was entirely a command, don't display it
          if (processedText === "") {
            return;
          }
        }
        
        setRtmMessages(prev => [...prev, {
          type: isFromAgent ? 'agent' : 'user',
          time: timestamp || Date.now(),
          content: processedText,
          contentType: 'text',
          userId: publisher,
          isOwn: !isFromAgent
        }]);
      }
      return;
    }
    
    // Handle binary messages
    if (messageType === "BINARY") {
      try {
        const decoder = new TextDecoder("utf-8");
        const decodedMessage = decoder.decode(message);
        
        // Clear typing indicator when real message arrives
        if (setTypingUsers && isFromAgent) {
          setTypingUsers(prev => {
            const newSet = new Set(prev);
            newSet.delete(publisher);
            return newSet;
          });
        }
        
        // Process message if processor is provided
        let processedText = decodedMessage;
        if (messageProcessor && isFromAgent) {
          processedText = messageProcessor(processedText);
          
          // If the message was entirely a command, don't display it
          if (processedText === "") {
            return;
          }
        }
        
        // Try to parse as JSON
        try {
          const parsedMsg = JSON.parse(decodedMessage);
          
          if (parsedMsg.text !== undefined) {
            // Process message if processor is provided
            let processedText = parsedMsg.text;
            if (messageProcessor && isFromAgent) {
              processedText = messageProcessor(processedText, parsedMsg.turn_id || "");
              
              // If the message was entirely a command, don't display it
              if (processedText === "") {
                return;
              }
            }
            
            setRtmMessages(prev => [...prev, {
              type: isFromAgent ? 'agent' : 'user',
              time: timestamp || Date.now(),
              content: processedText,
              contentType: 'text',
              userId: publisher,
              isOwn: !isFromAgent,
              turn_id: parsedMsg.turn_id
            }]);
            return;
          }
        } catch {
          // Not valid JSON, use the decoded message directly
        }
        
        // Use the decoded message as plain text
        setRtmMessages(prev => [...prev, {
          type: isFromAgent ? 'agent' : 'user',
          time: timestamp || Date.now(),
          content: processedText,
          contentType: 'text',
          userId: publisher,
          isOwn: !isFromAgent
        }]);
      } catch (error) {
        console.error("[RTM] Error processing binary message:", error);
      }
    }
  } catch (error) {
    console.error("Error processing RTM message:", error);
  }
};