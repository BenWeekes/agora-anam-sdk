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
    const [connectionClosed, setConnectionClosed] = useState(false); // Track if connection was closed
    const sessionReadyTimeoutRef = useRef(null);
    const anamClientRef = useRef(null); // Keep a ref to ensure consistency
    const reconnectAttempts = useRef(0);
    const maxReconnectAttempts = 3;
    const readyDelayTimeoutRef = useRef(null); // New timeout for state synchronization delay
    const isIntentionalDisconnect = useRef(false); // Track intentional disconnects

    const eventHandlerRef = useRef();
    eventHandlerRef.current = eventHandler;

    // Initialize Anam client when session token is available
    useEffect(() => {
        if (anamSessionToken && !anamClientRef.current && !connectionClosed) {
            console.log("Initializing Anam client with session token");

            try {
                const client = createClient(anamSessionToken);

                // Debug: Log the client object and its properties
                console.log("Created Anam client:", client);
                console.log("Client type:", typeof client);
                console.log("Client methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
                console.log("Client properties:", Object.keys(client));

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

                client.addListener(AnamEvent.CONNECTION_CLOSED, (event) => {
                    console.log("Anam CONNECTION_CLOSED event fired!", event);

                    // Clear any pending ready delay timeout
                    if (readyDelayTimeoutRef.current) {
                        clearTimeout(readyDelayTimeoutRef.current);
                        readyDelayTimeoutRef.current = null;
                    }

                    // Mark connection as closed to prevent further operations
                    setConnectionClosed(true);
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

                    // Only show error toast if this wasn't an intentional disconnect
                    if (!isIntentionalDisconnect.current) {
                        // Show error to user
                        const reason = event?.reason || "Connection to avatar server was lost";
                        showToast("Avatar Connection Lost", reason, true);

                        // Don't attempt to reconnect if server explicitly closed the connection
                        if (reason.includes("problem with our servers")) {
                            console.error("Server-side error detected, not attempting reconnect");
                            reconnectAttempts.current = maxReconnectAttempts; // Prevent reconnection
                        }
                    } else {
                        console.log("Intentional disconnect - not showing error toast");
                    }

                    // Reset the intentional disconnect flag
                    isIntentionalDisconnect.current = false;
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
                });

                client.addListener('sessionready', async () => {
                    console.log("Anam sessionready event fired (no underscore)!");

                    // Clear the timeout since event fired
                    if (sessionReadyTimeoutRef.current) {
                        clearTimeout(sessionReadyTimeoutRef.current);
                        sessionReadyTimeoutRef.current = null;
                    }

                    // Don't mark as ready yet - wait for streaming to be established
                    if (!isStreamingStarted) {
                        console.log("sessionready fired but streaming not started yet");
                    }
                });

                // Store in both ref and state
                anamClientRef.current = client;
                setAnamClient(client);
                setConnectionClosed(false); // Reset connection closed flag
                reconnectAttempts.current = 0; // Reset reconnect attempts
            } catch (error) {
                console.error("Failed to create Anam client:", error);
                showToast("Failed to initialize Anam client", error.message, true);
            }
        }
    }, [anamSessionToken, connectionClosed, updateConnectionState, showToast, isStreamingStarted]);

    // Function to send message to Anam avatar - DIRECT, no queue
    const sendMessageToAvatar = useCallback(async (message) => {
        if (!message || typeof message !== 'string') return false;

        // Use ref for consistency
        const client = anamClientRef.current;

        // Check if connection was closed
        if (connectionClosed) {
            console.warn("Cannot send message to Anam - connection was closed by server");
            return false;
        }

        // Only send if avatar is fully ready
        if (!client || !isAnamReady || !sessionStarted || !isStreamingStarted) {
            console.warn("Cannot send message to Anam - avatar not ready:", {
                hasClient: !!client,
                isReady: isAnamReady,
                sessionStarted,
                isStreamingStarted,
                connectionClosed
            });
            return false;
        }

        console.log("Sending message directly to Anam avatar:", message);

        try {
            await client.talk(message);
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

                // If peer connection is null, the connection was likely closed
                if (error.message.includes('peer connection is null')) {
                    setConnectionClosed(true);
                }
            }

            return false;
        }
    }, [isAnamReady, sessionStarted, isStreamingStarted, connectionClosed]);

    // Process message and handle any commands
    const processAndSendMessageToAvatar = useCallback(async (message, contextId = "") => {
        // For Anam, we just send the plain text without processing commands
        // Remove any HTML tags or special formatting
        const cleanMessage = message.replace(/<[^>]*>/g, '').trim();
        if (cleanMessage) {
            // Send directly, don't queue
            // Return the result so messageService can track it properly
            const sent = await sendMessageToAvatar(cleanMessage);
            return sent; // Return boolean result
        }
        return false;
    }, [sendMessageToAvatar]);

    const resetAvatarToDefault = useCallback(() => {
        // Stop any ongoing speech
        if (anamClientRef.current && isAnamReady && !connectionClosed) {
            console.log("Avatar reset triggered");
        }
    }, [isAnamReady, connectionClosed]);

    // Helper function to mark avatar as ready with delay for state synchronization
    const markAvatarAsReady = useCallback(() => {
        console.log("Preparing to mark avatar as ready with synchronization delay...");
        
        // Clear any existing ready delay timeout
        if (readyDelayTimeoutRef.current) {
            clearTimeout(readyDelayTimeoutRef.current);
        }

        // Set a small delay to ensure all state updates have propagated
        readyDelayTimeoutRef.current = setTimeout(() => {
            console.log("State synchronization delay completed, marking avatar as ready");
            setIsAnamReady(true);
            updateConnectionState(ConnectionState.AVATAR_READY);
            updateConnectionState(ConnectionState.AVATAR_LOADED);
            updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
            callNativeAppFunction("anamSessionReady");

            // Clear any pending session ready timeout
            if (sessionReadyTimeoutRef.current) {
                clearTimeout(sessionReadyTimeoutRef.current);
                sessionReadyTimeoutRef.current = null;
            }

            readyDelayTimeoutRef.current = null;
        }, 150); // 150ms delay to ensure state consistency
    }, [updateConnectionState]);

    const connectAvatar = useCallback(async () => {
        const client = anamClientRef.current;

        // Don't connect if connection was closed by server
        if (connectionClosed) {
            console.warn("Not attempting to connect - connection was closed by server");
            return;
        }

        if (client && !sessionStarted) {
            updateConnectionState(ConnectionState.AVATAR_WS_CONNECTING);
            try {
                console.log("Starting Anam session...");
                setSessionStarted(true);

                // Start the session first
                const sessionResult = await client.startSession();
                console.log("Anam session started successfully:", sessionResult);

                // Only proceed if connection wasn't closed during session start
                if (connectionClosed) {
                    console.warn("Connection closed during session start");
                    setSessionStarted(false);
                    return;
                }

                // Start streaming immediately after session starts
                try {
                    const videoElement = document.getElementById('anam-avatar-video');
                    if (videoElement) {
                        console.log("Starting streaming immediately after session start...");
                        await client.streamToVideoAndAudioElements(videoElement.id);

                        // Check again if connection wasn't closed
                        if (connectionClosed) {
                            console.warn("Connection closed during streaming setup");
                            setIsStreamingStarted(false);
                            setSessionStarted(false);
                            return;
                        }

                        setIsStreamingStarted(true);
                        console.log("Started streaming immediately after session start");

                        // Now that both session and streaming are ready, mark avatar as ready with delay
                        console.log("Both session and streaming ready, preparing to mark avatar as ready");
                        markAvatarAsReady();
                    }
                } catch (streamError) {
                    console.error("Failed to start streaming after session start:", streamError);

                    // Don't mark as ready if streaming fails
                    setSessionStarted(false);
                    setIsStreamingStarted(false);

                    // Check if it's an "already streaming" error
                    if (streamError.message && streamError.message.includes('Already streaming')) {
                        console.warn("Streaming already active - possible state mismatch");
                        // Try to recover by setting streaming as started
                        setIsStreamingStarted(true);
                        markAvatarAsReady();
                    } else {
                        showToast("Failed to start avatar streaming", streamError.message, true);
                    }
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
        } else if (sessionStarted && !connectionClosed) {
            console.log("Session already started, skipping...");
            // Session already started, just update state
            updateConnectionState(ConnectionState.AVATAR_WS_CONNECTED);
        }
    }, [sessionStarted, connectionClosed, updateConnectionState, showToast, markAvatarAsReady]);

    const disconnectAvatar = useCallback(() => {
        const client = anamClientRef.current;
        if (client) {
            try {
                // Mark this as an intentional disconnect
                isIntentionalDisconnect.current = true;
                
                // According to docs, the method is stopStreaming()
                if (isStreamingStarted) {
                    client.stopStreaming();
                }
            } catch (error) {
                console.error("Error stopping Anam streaming:", error);
            }
            
            // Clear any pending ready delay timeout
            if (readyDelayTimeoutRef.current) {
                clearTimeout(readyDelayTimeoutRef.current);
                readyDelayTimeoutRef.current = null;
            }
            
            setIsAnamReady(false);
            setSessionStarted(false);
            setIsStreamingStarted(false);
            setConnectionClosed(false); // Reset connection closed flag
            anamClientRef.current = null;
            setAnamClient(null);
            updateConnectionState(ConnectionState.AVATAR_WS_DISCONNECT);

            // Clear timeout on disconnect
            if (sessionReadyTimeoutRef.current) {
                clearTimeout(sessionReadyTimeoutRef.current);
                sessionReadyTimeoutRef.current = null;
            }
        }
    }, [isStreamingStarted, updateConnectionState]);

    // Cleanup timeouts on unmount
    useEffect(() => {
        return () => {
            if (sessionReadyTimeoutRef.current) {
                clearTimeout(sessionReadyTimeoutRef.current);
            }
            if (readyDelayTimeoutRef.current) {
                clearTimeout(readyDelayTimeoutRef.current);
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