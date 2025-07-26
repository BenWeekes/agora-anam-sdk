// react/src/components/RtmChatPanel.js - Updated for Anam integration
import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { MessageEngine, MessageStatus } from "../utils/messageService";
import ExpandableChatInput from "./ExpandableChatInput";

/**
 * Shared function to process and filter RTM messages
 * Handles command processing and determines if message should be displayed in chat
 */
const processRtmMessage = (message, currentUserId, processMessage, urlParams, isConnectInitiated) => {
  const isFromAgent = message.type === 'agent' || message.userId !== String(currentUserId) || !message.isOwn;
  
  // Only process commands for agent messages with text content
  if (isFromAgent && processMessage && message.contentType === 'text') {
    const shouldProcessCommands = !(urlParams.purechat && !isConnectInitiated);
    
    if (shouldProcessCommands) {
      const processedText = processMessage(message.content, message.turn_id || "");
      
      // If message becomes empty after command processing, don't display it
      if (processedText === "" || processedText.trim() === "") {
        console.log("Message was entirely commands, not displaying:", message.content);
        return null;
      }
      
      // Return message with processed content
      return {
        ...message,
        content: processedText
      };
    }
  }
  
  return message;
};

/**
 * Component for RTM chat interface with WhatsApp-like styling and typing indicators
 * Updated to work with Anam avatar integration
 */
export const RtmChatPanel = ({
  rtmClient,
  rtmMessages,
  rtmJoined,
  agoraConfig,
  agoraClient,
  isConnectInitiated,
  processMessage,
  isFullscreen,
  registerDirectSend,
  urlParams,
  getMessageChannelName
}) => {
  const [rtmInputText, setRtmInputText] = useState("");
  const [liveSubtitles, setLiveSubtitles] = useState([]);
  const [combinedMessages, setCombinedMessages] = useState([]);
  const [pendingRtmMessages, setPendingRtmMessages] = useState([]);
  const [preservedSubtitleMessages, setPreservedSubtitleMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const rtmMessageEndRef = useRef(null);
  const messageEngineRef = useRef(null);

  const floatingInput = document.getElementById("floating-input");
  const staticInput = document.getElementById("static-input");

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const isPureChatMode = urlParams?.purechat === true;
  const isChatEnabled = isConnectInitiated || (isPureChatMode && rtmClient);

  const channelName = urlParams?.channelName || agoraConfig.channelName || "";

  const getAvatarProfileUrl = useCallback((userId) => {
    if (userId === '0' || userId === 0 || (typeof userId === 'string' && userId.toLowerCase().includes('agent'))) {
      // For Anam, return a default avatar or get from configuration
      return null; // Will use initial circle instead
    }
    return null;
  }, []);

  const getSenderName = useCallback((userId) => {
    if (!userId || typeof userId !== 'string') return null;
    const parts = userId.split('-');
    return parts[0] || userId;
  }, []);

  const getSenderInitial = useCallback((userId) => {
    const name = getSenderName(userId);
    return name ? name.charAt(0).toUpperCase() : '?';
  }, [getSenderName]);

  const getSenderColor = useCallback((userId) => {
    if (!userId || typeof userId !== 'string') return '#999999';
    
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const hue = Math.abs(hash) % 360;
    const saturation = 65;
    const lightness = 45;
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }, []);

  useEffect(() => {
    if (isPureChatMode && !isConnectInitiated && liveSubtitles.length > 0) {
      console.log("Preserving subtitle messages on purechat disconnect:", liveSubtitles.length);
      
      const messagesToPreserve = liveSubtitles.filter(msg => {
        const messageText = msg.text || (msg.metadata && msg.metadata.text) || "";
        return messageText && messageText.trim().length > 0;
      });
      
      if (messagesToPreserve.length > 0) {
        setPreservedSubtitleMessages(prevPreserved => {
          const newCompleted = messagesToPreserve.filter(newMsg => 
            !prevPreserved.some(preserved => 
              preserved.message_id === newMsg.message_id || 
              (preserved.turn_id === newMsg.turn_id && preserved.uid === newMsg.uid && 
               preserved.text === (newMsg.text || (newMsg.metadata && newMsg.metadata.text) || ""))
            )
          );
          console.log("Adding", newCompleted.length, "new preserved messages");
          return [...prevPreserved, ...newCompleted];
        });
      }
      
      setLiveSubtitles([]);
    }
  }, [isPureChatMode, isConnectInitiated, liveSubtitles]);

  const directSendMessage = useCallback(async (message, skipHistory = false, channel = null) => {
    if (!message.trim()) return false;

    try {
      const targetChannel = channel || (getMessageChannelName ? getMessageChannelName() : '') || '';
      const publishTarget = targetChannel ? `agent-${targetChannel}` : 'agent';
      
      console.log("Direct send using rtmClient:", !!rtmClient, "Skip history:", skipHistory, "Target:", publishTarget);
      
      if (rtmClient) {
        const options = {
          customType: "user.transcription",
          channelType: "USER",
        };
        
        await rtmClient.publish(publishTarget, message.trim(), options);
        console.log("Message sent successfully via direct send to:", publishTarget);

        const shouldAddToHistory = !skipHistory && (isPureChatMode && !isConnectInitiated);
        
        if (shouldAddToHistory) {
          console.log("Adding user message to local history (purechat mode)");
          setPendingRtmMessages((prev) => [...prev, {
            type: "user",
            time: Date.now(),
            content: message.trim(),
            contentType: "text",
            userId: String(agoraConfig.uid),
            isOwn: true,
          }]);
        } else {
          console.log("Not adding to local history - message will echo back from agent or skipHistory=true");
        }

        return true;
      } else {
        console.error("Direct send failed - rtmClient not available");
        return false;
      }
    } catch (error) {
      console.error("Failed to send message via direct send:", error);
      return false;
    }
  }, [rtmClient, agoraConfig.uid, getMessageChannelName, isPureChatMode, isConnectInitiated]);  

  useEffect(() => {
    if (registerDirectSend && rtmClient) {
      console.log("Registering direct send function with rtmClient");
      registerDirectSend(directSendMessage);
    }
  }, [registerDirectSend, rtmClient, directSendMessage]);

  const handleRtmMessageCallback = useCallback(
    (event) => {
      console.warn('handleRtmMessageCallback', event);
      
      try {
        const { message, messageType, timestamp, publisher } = event;
        
        console.log("[RTM] Message received:", {
          publisher,
          currentUserId: agoraConfig.uid,
          messageType,
          timestamp,
          message: typeof message === 'string' ? message : '[binary data]'
        });
        
        const isFromAgent = publisher !== String(agoraConfig.uid);
        
        if (messageType === "STRING") {
          let messageToProcess = null;
          
          try {
            const parsedMsg = JSON.parse(message);
            
            if (parsedMsg.type === "typing_start") {
              if (isFromAgent) {
                setTypingUsers(prev => new Set([...prev, publisher]));
                setTimeout(() => {
                  setTypingUsers(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(publisher);
                    return newSet;
                  });
                }, 15000);
              }
              return;
            }
            
            if (parsedMsg.img) {
              messageToProcess = {
                type: isFromAgent ? 'agent' : 'user',
                time: timestamp || Date.now(),
                content: parsedMsg.img,
                contentType: 'image',
                userId: publisher,
                isOwn: !isFromAgent
              };
            }
            else if (parsedMsg.text !== undefined) {
              messageToProcess = {
                type: isFromAgent ? 'agent' : 'user',
                time: timestamp || Date.now(),
                content: parsedMsg.text,
                contentType: 'text',
                userId: publisher,
                isOwn: !isFromAgent,
                turn_id: parsedMsg.turn_id
              };
            }
            else {
              messageToProcess = {
                type: isFromAgent ? 'agent' : 'user',
                time: timestamp || Date.now(),
                content: message,
                contentType: 'text',
                userId: publisher,
                isOwn: !isFromAgent
              };
            }
            
          } catch (parseError) {
            messageToProcess = {
              type: isFromAgent ? 'agent' : 'user',
              time: timestamp || Date.now(),
              content: message,
              contentType: 'text',
              userId: publisher,
              isOwn: !isFromAgent
            };
          }
          
          if (messageToProcess) {
            if (isFromAgent) {
              setTypingUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(publisher);
                return newSet;
              });
            }
            
            const processedMessage = processRtmMessage(
              messageToProcess, 
              agoraConfig.uid, 
              processMessage, 
              urlParams, 
              isConnectInitiated
            );
            
            if (processedMessage) {
              setPendingRtmMessages(prev => [...prev, processedMessage]);
            }
          }
          return;
        }
        
        if (messageType === "BINARY") {
          try {
            const decoder = new TextDecoder("utf-8");
            const decodedMessage = decoder.decode(message);
            
            if (isFromAgent) {
              setTypingUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(publisher);
                return newSet;
              });
            }
            
            let messageToProcess = null;
            
            try {
              const parsedMsg = JSON.parse(decodedMessage);
              
              if (parsedMsg.text !== undefined) {
                messageToProcess = {
                  type: isFromAgent ? 'agent' : 'user',
                  time: timestamp || Date.now(),
                  content: parsedMsg.text,
                  contentType: 'text',
                  userId: publisher,
                  isOwn: !isFromAgent,
                  turn_id: parsedMsg.turn_id
                };
              }
            } catch {
              messageToProcess = {
                type: isFromAgent ? 'agent' : 'user',
                time: timestamp || Date.now(),
                content: decodedMessage,
                contentType: 'text',
                userId: publisher,
                isOwn: !isFromAgent
              };
            }
            
            if (messageToProcess) {
              const processedMessage = processRtmMessage(
                messageToProcess, 
                agoraConfig.uid, 
                processMessage, 
                urlParams, 
                isConnectInitiated
              );
              
              if (processedMessage) {
                setPendingRtmMessages(prev => [...prev, processedMessage]);
              }
            }
          } catch (error) {
            console.error("[RTM] Error processing binary message:", error);
          }
        }
      } catch (error) {
        console.error("Error processing RTM message:", error);
      }
    },
    [agoraConfig.uid, processMessage, urlParams, isConnectInitiated]
  );

  // Initialize MessageEngine for subtitles with Anam message processor
  useEffect(() => {
    if (isPureChatMode && !isConnectInitiated) {
      console.log("Skipping MessageEngine initialization - purechat mode without agent connection");
      return;
    }

    if (!agoraClient) {
      console.log("MessageEngine init blocked - no agoraClient");
      return;
    }
    
    if (messageEngineRef.current) {
      console.log("MessageEngine init blocked - already exists");
      return;
    }
    
    if (!isConnectInitiated) {
      console.log("MessageEngine init blocked - not connected");
      return;
    }
   
    console.log("Initializing MessageEngine with client:", agoraClient, "purechat mode:", isPureChatMode);

    if (!messageEngineRef.current) {
      messageEngineRef.current = new MessageEngine(
        agoraClient,
        "auto",
        (messageList) => {
          console.log(`Received ${messageList.length} subtitle messages (purechat: ${isPureChatMode})`);
          if (messageList && messageList.length > 0) {
            setLiveSubtitles((prev) => {
              const newMessages = [...messageList];
              
              const completedMessages = newMessages.filter(msg => 
                msg.status === MessageStatus.END && msg.text && msg.text.trim().length > 0
              );
              
              if (completedMessages.length > 0) {
                setPreservedSubtitleMessages(prevPreserved => {
                  const newCompleted = completedMessages.filter(newMsg => 
                    !prevPreserved.some(preserved => 
                      preserved.message_id === newMsg.message_id || 
                      (preserved.turn_id === newMsg.turn_id && preserved.uid === newMsg.uid)
                    )
                  );
                  return [...prevPreserved, ...newCompleted];
                });
              }
              
              return newMessages;
            });
          }
        },
        urlParams,
        processMessage // Pass the message processor for Anam avatar
      );
      console.log("MessageEngine initialized successfully:", !!messageEngineRef.current, "purechat mode:", isPureChatMode);
    } else {
      if (messageEngineRef.current.messageList.length > 0) {
        setLiveSubtitles([...messageEngineRef.current.messageList]);
      }
    }

    return () => {
      if (messageEngineRef.current) {
        console.log("Cleaning up MessageEngine");
        messageEngineRef.current.cleanup();
        messageEngineRef.current = null;
      }
    };
  }, [agoraClient, isConnectInitiated, processMessage, isPureChatMode, urlParams]);

  useEffect(() => {
    if (rtmMessages && rtmMessages.length > 0) {
      const newMessages = rtmMessages.filter(
        (msg) =>
          !pendingRtmMessages.some(
            (pending) =>
              pending.time === msg.time &&
              pending.content === msg.content &&
              pending.userId === msg.userId
          )
      );

      if (newMessages.length > 0) {
        const processedMessages = newMessages
          .map(msg => processRtmMessage(msg, agoraConfig.uid, processMessage, urlParams, isConnectInitiated))
          .filter(msg => msg !== null);

        if (processedMessages.length > 0) {
          console.log("Adding processed messages:", processedMessages);
          setPendingRtmMessages((prev) => [...prev, ...processedMessages]);
        } else {
          console.log("All new messages were command-only, none added to chat");
        }
      }
    }
  }, [rtmMessages, pendingRtmMessages, agoraConfig.uid, processMessage, urlParams, isConnectInitiated]);

  // Combine live subtitles and RTM messages into a single timeline
  useEffect(() => {
    if (isPureChatMode && !isConnectInitiated) {
      const typedMessages = pendingRtmMessages
        .filter(msg => {
          try {
            const parsed = JSON.parse(msg.content);
            return parsed.type !== "typing_start";
          } catch {
            return true;
          }
        })
        .map((msg, index) => {
          const validTime =
            msg.time && new Date(msg.time).getFullYear() > 1971 ? msg.time : Date.now();
          return {
            id: `typed-${msg.userId}-${validTime}`,
            ...msg,
            time: validTime,
            isSubtitle: false,
            fromPreviousSession: false,
          };
        });

      const preservedSubtitleMessagesForDisplay = preservedSubtitleMessages.map((msg) => {
        const messageText = msg.text || (msg.metadata && msg.metadata.text) || "";
        const msgTime = msg._time || msg.start_ms;
        const validTime = msgTime && new Date(msgTime).getFullYear() > 1971 ? msgTime : Date.now();

        return {
          id: `preserved-subtitle-${msg.uid}-${msg.turn_id}-${msg.message_id || validTime}`,
          type: msg.uid === 0 ? "agent" : "user",
          time: validTime,
          content: messageText,
          contentType: "text",
          userId: msg.user_id || String(msg.uid),
          isOwn: msg.uid !== 0,
          isSubtitle: true,
          status: MessageStatus.END,
          turn_id: msg.turn_id,
          message_id: msg.message_id,
          fromPreviousSession: true,
        };
      });

      const allMessages = [...typedMessages, ...preservedSubtitleMessagesForDisplay];
      setCombinedMessages(allMessages.sort((a, b) => a.time - b.time));
      return;
    }

    const subtitleMessages = [];
    const now = Date.now();

    preservedSubtitleMessages.forEach((msg) => {
      const messageText = msg.text || (msg.metadata && msg.metadata.text) || "";
      if (!messageText || messageText.trim().length === 0) {
        return;
      }

      const msgTime = msg._time || msg.start_ms;
      const validTime =
        msgTime && new Date(msgTime).getFullYear() > 1971 ? msgTime : now;

      subtitleMessages.push({
        id: `preserved-subtitle-${msg.uid}-${msg.turn_id}-${msg.message_id || now}`,
        type: msg.uid === 0 ? "agent" : "user",
        time: validTime,
        content: messageText,
        contentType: "text",
        userId: msg.user_id || String(msg.uid),
        isOwn: msg.uid !== 0,
        isSubtitle: true,
        status: MessageStatus.END,
        turn_id: msg.turn_id,
        message_id: msg.message_id,
        fromPreviousSession: !isConnectInitiated,
      });
    });

    liveSubtitles.forEach((msg) => {
      const messageText = msg.text || (msg.metadata && msg.metadata.text) || "";
      if (!messageText || messageText.trim().length === 0) {
        return;
      }

      const alreadyPreserved = preservedSubtitleMessages.some(preserved => 
        preserved.message_id === msg.message_id || 
        (preserved.turn_id === msg.turn_id && preserved.uid === msg.uid && preserved.text === messageText)
      );
      
      if (alreadyPreserved) {
        return;
      }

      const msgTime = msg._time || msg.start_ms;
      const validTime =
        msgTime && new Date(msgTime).getFullYear() > 1971 ? msgTime : now;

      subtitleMessages.push({
        id: `subtitle-${msg.uid}-${msg.turn_id}-${msg.message_id || now}`,
        type: msg.uid === 0 ? "agent" : "user",
        time: validTime,
        content: messageText,
        contentType: "text",
        userId: msg.user_id || String(msg.uid),
        isOwn: msg.uid !== 0,
        isSubtitle: true,
        status: msg.status,
        turn_id: msg.turn_id,
        message_id: msg.message_id,
        fromPreviousSession: !isConnectInitiated,
      });
    });

    const typedMessages = pendingRtmMessages
      .filter(msg => {
        try {
          const parsed = JSON.parse(msg.content);
          return parsed.type !== "typing_start";
        } catch {
          return true;
        }
      })
      .map((msg, index) => {
        const validTime =
          msg.time && new Date(msg.time).getFullYear() > 1971 ? msg.time : now;
        return {
          id: `typed-${msg.userId}-${validTime}`,
          ...msg,
          time: validTime,
          isSubtitle: false,
          fromPreviousSession: !isConnectInitiated && validTime < now - 5000,
        };
      });

    const allMessageMap = new Map();

    subtitleMessages.forEach((msg) => {
      const key = msg.message_id || `${msg.userId}-${msg.turn_id}`;
      allMessageMap.set(key, msg);
    });

    typedMessages.forEach((msg) => {
      const key = `typed-${msg.userId}-${msg.time}`;

      const hasSimilarSubtitle = Array.from(allMessageMap.values()).some(
        (existing) =>
          existing.isSubtitle &&
          existing.userId === msg.userId &&
          existing.content.trim() === msg.content.trim()
      );

      if (!hasSimilarSubtitle) {
        allMessageMap.set(key, msg);
      }
    });

    const allMessages = Array.from(allMessageMap.values()).sort(
      (a, b) => a.time - b.time
    );

    console.log("Combined messages count:", allMessages.length, "Subtitles:", subtitleMessages.length, "RTM:", typedMessages.length, "Preserved:", preservedSubtitleMessages.length);
    setCombinedMessages(allMessages);
  }, [liveSubtitles, pendingRtmMessages, preservedSubtitleMessages, isConnectInitiated, isPureChatMode]);

  useEffect(() => {
    if (isConnectInitiated && messageEngineRef.current && !isPureChatMode) {
      const messageList = messageEngineRef.current.messageList;
      if (messageList.length > 0) {
        console.log("Connection status changed, forcing message update");
        setLiveSubtitles([...messageList]);
      }
    }
  }, [isConnectInitiated, isPureChatMode]);

  useEffect(() => {
    if (rtmMessageEndRef.current && !isKeyboardVisible) {
      rtmMessageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [combinedMessages, isKeyboardVisible, typingUsers]);

  const handleSendMessage = async () => {
    if (!rtmInputText.trim()) return;

    const messageToSend = rtmInputText.trim();
    setRtmInputText("");

    await directSendMessage(messageToSend);
  };

  useEffect(() => {
    if (rtmClient) {
      rtmClient.addEventListener("message", handleRtmMessageCallback);
      
      return () => {
        rtmClient.removeEventListener("message", handleRtmMessageCallback);
      };
    }
  }, [rtmClient, handleRtmMessageCallback]);

  const renderTypingIndicator = () => {
    if (typingUsers.size === 0) return null;

    const typingUserId = [...typingUsers][0];
    const avatarUrl = getAvatarProfileUrl(typingUserId);
    const showInitialCircle = !avatarUrl && typingUserId !== '0';

    return (
      <div key="typing-indicator" className="rtm-message other-message typing-indicator">
        {avatarUrl && (
          <img
            src={avatarUrl}
            alt="Avatar"
            className="rtm-message-avatar"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        )}
        {showInitialCircle && (
          <div 
            className="rtm-message-initial-circle"
            style={{ backgroundColor: getSenderColor(typingUserId) }}
          >
            {getSenderInitial(typingUserId)}
          </div>
        )}
        <div className="rtm-message-content">
          <div className="typing-dots">
            <div className="typing-dot"></div>
            <div className="typing-dot"></div>
            <div className="typing-dot"></div>
          </div>
        </div>
      </div>
    );
  };

  const renderMessage = (message, index) => {
    if (!message.content || message.content.trim().length === 0) {
      return null;
    }
    
    const isAgentMessage = message.type === 'agent';
    let messageClass = `rtm-message ${message.isOwn ? "own-message" : "other-message"}`;

    if (message.isSubtitle && message.status === MessageStatus.IN_PROGRESS) {
      messageClass += " message-in-progress";
    }

    if (!isConnectInitiated && message.fromPreviousSession) {
      messageClass += " previous-session";
    }

    const messageTime = message.time || Date.now();
    const messageDate = new Date(messageTime);
    const isValidDate = messageDate.getFullYear() > 1971;

    let avatarUrl = null;
    let showInitialCircle = false;
    let senderInitial = null;
    let senderColor = null;

    console.log("renderMessage debug:", {
      userId: message.userId,
      type: message.type,
      isOwn: message.isOwn,
      isAgentMessage,
      content: message.content?.substring(0, 30) + "..."
    });

    // For agent messages, show initial circle (no avatar photo for Anam)
    if (isAgentMessage) {
      showInitialCircle = true;
      senderInitial = 'A'; // A for Anam/Agent
      senderColor = '#007aff'; // Use a nice blue for agent
    } 
    // For user messages, show initial circle ONLY if name param is set
    else if (urlParams?.name || agoraConfig.name) {
      showInitialCircle = true;
      senderInitial = getSenderInitial(message.userId);
      senderColor = getSenderColor(message.userId);
    }

    console.log("Message display decision:", {
      showAvatar: !!avatarUrl,
      showInitialCircle,
      senderInitial,
      senderColor,
      userId: message.userId
    });

    return (
      <div key={message.id || index} className={messageClass}>
        {!message.isOwn && avatarUrl && (
          <img
            src={avatarUrl}
            alt="Avatar"
            className="rtm-message-avatar"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        )}
        {showInitialCircle && (
          <div 
            className="rtm-message-initial-circle"
            style={{ backgroundColor: senderColor }}
          >
            {senderInitial}
          </div>
        )}
        <div className="rtm-message-content">
          {message.contentType === "image" ? (
            <img
              src={message.content}
              className="rtm-image-content"
              alt="Shared content"
            />
          ) : (
            message.content
          )}
        </div>
        <div className="rtm-message-time">
          {isValidDate
            ? messageDate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
        </div>
      </div>
    );
  };

  const renderMessageGroup = () => {
    if (combinedMessages.length === 0 && typingUsers.size === 0) return null;

    const result = [];
    let lastDate = null;
    const now = new Date();

    combinedMessages.forEach((message, index) => {
      if (!message.content || message.content.trim().length === 0) {
        return;
      }
      
      const messageTime = message.time || Date.now();
      const messageDate = new Date(messageTime);

      const isValidDate = messageDate.getFullYear() > 1971;
      const messageLocaleDateString = isValidDate
        ? messageDate.toLocaleDateString()
        : now.toLocaleDateString();

      if (messageLocaleDateString !== lastDate && isValidDate) {
        result.push(
          <div key={`date-${messageLocaleDateString}`} className="date-divider">
            {messageLocaleDateString}
          </div>
        );
        lastDate = messageLocaleDateString;
      }

      const renderedMessage = renderMessage(message, index);
      if (renderedMessage) {
        result.push(renderedMessage);
      }
    });

    if (typingUsers.size > 0) {
      result.push(renderTypingIndicator());
    }

    return result;
  };

  const getEmptyStateMessage = () => {
    if (isPureChatMode) {
      return isChatEnabled 
        ? "Chat connected. Start typing to send messages!" 
        : "Connecting to chat...";
    }
    return isConnectInitiated
      ? "No messages yet. Start the conversation by speaking or typing!"
      : "No messages";
  };

  return (
    <div className={`rtm-container  ${isFullscreen ? "hidden": ""}`} >
      <div className="rtm-messages">
        {combinedMessages.length === 0 && typingUsers.size === 0 ? (
          <div className="rtm-empty-state">
            {getEmptyStateMessage()}
          </div>
        ) : (
          <>{renderMessageGroup()}</>
        )}
        <div ref={rtmMessageEndRef} />
      </div>
      <div id="static-input"></div>

      {floatingInput &&
        staticInput &&
        createPortal(
          <ExpandableChatInput 
                rtmInputText={rtmInputText}
                setRtmInputText={setRtmInputText}
                handleSendMessage={handleSendMessage}
                disabled={!isChatEnabled}
                isKeyboardVisible={isKeyboardVisible} 
                setIsKeyboardVisible={setIsKeyboardVisible}
                isPureChatMode={isPureChatMode}
              />
          ,
          isKeyboardVisible ? floatingInput : staticInput
        )}
    </div>
  );
};