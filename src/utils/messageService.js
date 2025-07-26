// react/src/utils/messageService.js - Generic version without Trulience-specific logic
import { decodeStreamMessage } from './utils';

// Message Status Enum
export const MessageStatus = {
  IN_PROGRESS: 0,
  END: 1,
  INTERRUPTED: 2
};

// Message Engine Mode Enum
export const MessageEngineMode = {
  TEXT: 'text',
  WORD: 'word',
  AUTO: 'auto'
};

// Transcription Object Type Enum
export const TranscriptionObjectType = {
  USER_TRANSCRIPTION: 'user.transcription',
  AGENT_TRANSCRIPTION: 'assistant.transcription',
  MSG_INTERRUPTED: 'message.interrupt'
};

// Default configurations
const DEFAULT_MESSAGE_CACHE_TIMEOUT = 1000 * 60 * 5; // 5 minutes
const DEFAULT_INTERVAL = 200; // milliseconds
const CONSOLE_LOG_PREFIX = '[MessageService]';

/**
 * Message engine that handles real-time transcription and subtitle rendering
 */
export class MessageEngine {
  constructor(rtcEngine, renderMode, callback, urlParams = {}) {
    // Private properties
    this._messageCache = {};
    this._messageCacheTimeout = DEFAULT_MESSAGE_CACHE_TIMEOUT;
    this._mode = MessageEngineMode.AUTO;
    this._queue = [];
    this._interval = DEFAULT_INTERVAL;
    this._intervalRef = null;
    this._pts = 0;
    this._lastPoppedQueueItem = null;
    this._isRunning = false;
    this._rtcEngine = rtcEngine;
    this._processedMessageIds = new Set(); // Track processed message IDs
    this._urlParams = urlParams; // Store URL params for continue message filtering

    // Public properties
    this.messageList = [];
    this.onMessageListUpdate = callback || null;

    // Initialize
    this._rtcEngine = rtcEngine;
    this._listenRtcEvents();
    this.run();
    this.setMode(renderMode || MessageEngineMode.AUTO);
  }

  _listenRtcEvents() {
    if (!this._rtcEngine) {
      return;
    }
    
    this._rtcEngine.on('audio-metadata', (metadata) => {
      const pts64 = Number(new DataView(metadata.buffer).getBigUint64(0, true));
      this.setPts(pts64);
    });

    this._rtcEngine.on('stream-message', (_, payload) => {
      this.handleStreamMessage(payload);
    });
  }

  run(options = {}) {
    this._isRunning = true;
  }

  setupInterval() {
    if (!this._isRunning) {
      console.error(CONSOLE_LOG_PREFIX, 'Message service is not running');
      return;
    }
    
    if (this._intervalRef) {
      clearInterval(this._intervalRef);
      this._intervalRef = null;
    }
    
    this._intervalRef = setInterval(
      this._handleQueue.bind(this),
      this._interval
    );
  }

  teardownInterval() {
    if (this._intervalRef) {
      clearInterval(this._intervalRef);
      this._intervalRef = null;
    }
  }

  setPts(pts) {
    if (this._pts < pts) {
      this._pts = pts;
    }
  }

  handleStreamMessage(stream) {
    if (!this._isRunning) {
      console.warn(CONSOLE_LOG_PREFIX, 'Message service WAS not running');
      this._isRunning = true;
    }
    
    const chunk = this.streamMessage2Chunk(stream);
    this.handleChunk(chunk, this.handleMessage.bind(this));
  }

  // Check if a message is a continue message that should be filtered
  _isContinueMessage(messageText) {
    if (!this._urlParams.continue || !messageText) return false;
    
    // Check if this message matches our continue parameter
    return messageText.trim() === this._urlParams.continue.trim();
  }

  handleMessage(message) {
    if (message.message_id && this._processedMessageIds.has(message.message_id)) {
      console.warn(CONSOLE_LOG_PREFIX, 'Skipping already processed message:', message.message_id,message);
      return;
    }

    // Record that we've processed this message
    if (message.message_id) {
      this._processedMessageIds.add(message.message_id);
    }
    
    // Always log the message for debugging
    console.debug(CONSOLE_LOG_PREFIX, 'Processing message:', 
      message.object, 
      message.turn_id, 
      message.message_id,
      message.text?.slice(0, 30) + (message.text?.length > 30 ? '...' : '')
    );

    // Check message type
    const isAgentMessage = message.object === TranscriptionObjectType.AGENT_TRANSCRIPTION;
    const isUserMessage = message.object === TranscriptionObjectType.USER_TRANSCRIPTION;
    const isMessageInterrupt = message.object === TranscriptionObjectType.MSG_INTERRUPTED;
      
    if (!isAgentMessage && !isUserMessage && !isMessageInterrupt) {
      console.debug(CONSOLE_LOG_PREFIX, 'Unknown message type', message);
      return;
    }

    // Filter out continue messages from agent transcriptions
    if (isAgentMessage && this._isContinueMessage(message.text)) {
      console.log("Filtered out continue message from subtitles:", message.text);
      return; // Don't process continue messages
    }

        // If this is a user message, call the global function to clear the timeout
    if (isUserMessage && window.clearContinueMessageTimeout) {
      console.log("New user message detected in messageService, clearing continue timeout");
      window.clearContinueMessageTimeout();
    }
    
    // Set mode (only once)
    if (isAgentMessage && this._mode === MessageEngineMode.AUTO) {
      // Check if words is empty, and set mode
      if (!message.words) {
        this.setMode(MessageEngineMode.TEXT);
      } else {
        this.setupInterval();
        this.setMode(MessageEngineMode.WORD);
      }
    }
    
    // Handle Agent Message
    if (isAgentMessage) {
      if (this._mode === MessageEngineMode.WORD) {
        this.handleWordAgentMessage(message);
      } else {
        this.handleTextMessage(message);
      }
      return;
    }
    
    // Handle User Message
    if (isUserMessage) {
      this.handleTextMessage(message);
      return;
    }
    
    // Handle Message Interrupt
    if (isMessageInterrupt) {
      this.handleMessageInterrupt(message);
      return;
    }
  }

  // Utility function for timestamp validation
  _getValidTimestamp(timestamp) {
    // Check if timestamp is valid (not 0, not NaN, and not 1970)
    if (!timestamp || isNaN(timestamp) || new Date(timestamp).getFullYear() <= 1971) {
      return Date.now();
    }
    return timestamp;
  }

  // Handle text messages
  handleTextMessage(message) {
    // Filter out continue messages
    if (this._isContinueMessage(message.text)) {
      console.log("Filtered out continue message from text processing:", message.text);
      return;
    }

    // Get values from message
    const turn_id = message.turn_id;
    const text = message.text || '';
    const stream_id = message.stream_id || message.user_id;
    const isFinal = message.final === true || message.turn_status === MessageStatus.END;
    const status = isFinal ? MessageStatus.END : MessageStatus.IN_PROGRESS;
    const message_id = message.message_id;
    const user_id = message.user_id || stream_id; // Ensure we have user_id
    
    console.error(message);
    // Ensure valid timestamp
    const validTime = this._getValidTimestamp(message.start_ms || message._time);

    // Look for an existing message by turn_id and stream_id
    const existingMsgIndex = this.messageList.findIndex(
      (item) => item.turn_id === turn_id && item.uid === stream_id
    );
    
    if (existingMsgIndex >= 0) {
      // Update existing message
      const existingMsg = this.messageList[existingMsgIndex];
      
      // Only update if the text changed or status changed
      if (existingMsg.text !== text || existingMsg.status !== status) {
        this.messageList[existingMsgIndex] = {
          ...existingMsg,
          text,
          status,
          _time: validTime, // Use validated timestamp
          metadata: message,
          message_id,
          user_id: user_id // Preserve user_id for sender identification
        };
        
        this._mutateChatHistory();
      }
    } else {
      // Create a new message
      this._appendChatHistory({
        turn_id,
        uid: stream_id,
        _time: validTime, // Use validated timestamp
        text,
        status,
        metadata: message,
        message_id,
        user_id: user_id // Include user_id for sender identification
      });
      
      this._mutateChatHistory();
    }
  }

  // Add a message to chat history
  _appendChatHistory(item) {
    // Check if we already have a message with this message_id
    if (item.message_id && 
        this.messageList.some(msg => msg.message_id === item.message_id)) {
      return;
    }

    // Ensure valid timestamp
    item._time = this._getValidTimestamp(item._time);
    
    // If item.turn_id is 0, append to the front of messageList (greeting message)
    if (item.turn_id === 0) {
      this.messageList = [item, ...this.messageList];
    } else {
      this.messageList.push(item);
    }
  }

  handleMessageInterrupt(message) {
    console.debug(CONSOLE_LOG_PREFIX, 'handleMessageInterrupt', message);
    const turn_id = message.turn_id;
    const start_ms = message.start_ms;
    
    // Find message to interrupt
    const msgToInterrupt = this.messageList.find(
      (item) => item.turn_id === turn_id && item.status === MessageStatus.IN_PROGRESS
    );
    
    if (msgToInterrupt) {
      msgToInterrupt.status = MessageStatus.INTERRUPTED;
      this._mutateChatHistory();
    }
    
    // Also check the queue for any messages that need to be interrupted
    this._interruptQueue({
      turn_id,
      start_ms,
    });
  }

  handleWordAgentMessage(message) {
    // Filter out continue messages
    if (this._isContinueMessage(message.text)) {
      console.log("Filtered out continue message from word processing:", message.text);
      return;
    }

    // Drop message if turn_status is undefined and there's no "final" field
    const isFinal = message.final === true;
    const status = isFinal ? MessageStatus.END : 
                 (message.turn_status !== undefined ? message.turn_status : MessageStatus.IN_PROGRESS);

    console.debug(
      CONSOLE_LOG_PREFIX,
      'handleWordAgentMessage',
      JSON.stringify({
        turn_id: message.turn_id,
        text: message.text,
        status,
        message_id: message.message_id
      })
    );

    const turn_id = message.turn_id;
    const text = message.text || '';
    const words = message.words || [];
    const stream_id = message.stream_id;
    const user_id = message.user_id || stream_id; // Pass through user_id
    
    this._pushToQueue({
      turn_id,
      words,
      text,
      status,
      stream_id,
      message_id: message.message_id,
      user_id // Include user_id in queue
    });
  }

  sortWordsWithStatus(words, turn_status) {
    if (!words || words.length === 0) {
      return [];
    }
    
    const sortedWords = words
      .map((word) => ({
        ...word,
        word_status: MessageStatus.IN_PROGRESS,
      }))
      .sort((a, b) => a.start_ms - b.start_ms)
      .reduce((acc, curr) => {
        // Only add if start_ms is unique
        if (!acc.find((word) => word.start_ms === curr.start_ms)) {
          acc.push(curr);
        }
        return acc;
      }, []);
      
    const isMessageFinal = turn_status !== MessageStatus.IN_PROGRESS;
    if (isMessageFinal && sortedWords.length > 0) {
      sortedWords[sortedWords.length - 1].word_status = turn_status;
    }
    
    return sortedWords;
  }

  setMode(mode) {
    if (this._mode !== MessageEngineMode.AUTO) {
      console.warn(
        CONSOLE_LOG_PREFIX,
        'Mode should only be set once, but it is set again',
        'current mode:',
        this._mode
      );
      return;
    }
    
    if (mode === MessageEngineMode.AUTO) {
      console.warn(
        CONSOLE_LOG_PREFIX,
        'Unknown mode should not be set again',
        'current mode:',
        this._mode
      );
      return;
    }
    
    this._mode = mode;
  }

  cleanMessageCache() {
    this._messageCache = {};
    this._processedMessageIds.clear();
  }

  cleanup() {
    console.debug(CONSOLE_LOG_PREFIX, 'Cleanup message service');
    this._isRunning = false;
    
    // Clean up message cache
    this.cleanMessageCache();
    
    // Teardown interval
    this.teardownInterval();
    
    // Clean up queue
    this._queue = [];
    this._lastPoppedQueueItem = null;
    this._pts = 0;
    
    // Clean up messageList
    this.messageList = [];
    
    // Clean up mode
    this._mode = MessageEngineMode.AUTO;
  }

  // Utils: Uint8Array -> string
  streamMessage2Chunk(stream) {
    return decodeStreamMessage(stream);
  }

  /**
   * Handle a chunk of data from a stream message
   * @param {string} chunk - String format: {message_id}|{part_idx}|{part_sum}|{part_data}
   * @param {Function} callback - Callback function to process the complete message
   */
  handleChunk(chunk, callback) {
    try {
      // Split chunk by '|'
      const [msgId, partIdx, partSum, partData] = chunk.split('|');
      
      // Convert to data chunk
      const input = {
        message_id: msgId,
        part_idx: parseInt(partIdx, 10),
        part_sum: partSum === '???' ? -1 : parseInt(partSum, 10), // -1 means total parts unknown
        content: partData,
      };
      
      // Check if total parts is known, skip if unknown
      if (input.part_sum === -1) {
        console.debug(
          CONSOLE_LOG_PREFIX,
          'total parts unknown, waiting for further parts.'
        );
        return;
      }

      // Check if cached
      // Case 1: not cached, create new cache
      if (!this._messageCache[input.message_id]) {
        this._messageCache[input.message_id] = [];
        
        // Set cache timeout, drop it if incomplete after timeout
        setTimeout(() => {
          if (
            this._messageCache[input.message_id] &&
            this._messageCache[input.message_id].length < input.part_sum
          ) {
            console.debug(
              CONSOLE_LOG_PREFIX,
              input.message_id,
              'message cache timeout, drop it.'
            );
            delete this._messageCache[input.message_id];
          }
        }, this._messageCacheTimeout);
      }
      
      // Case 2: cached, add to cache (and sort by part_idx)
      if (
        !this._messageCache[input.message_id]?.find(
          (item) => item.part_idx === input.part_idx
        )
      ) {
        // Unique push
        this._messageCache[input.message_id].push(input);
      }
      
      this._messageCache[input.message_id].sort(
        (a, b) => a.part_idx - b.part_idx
      );

      // Check if complete
      if (this._messageCache[input.message_id].length === input.part_sum) {
        const message = this._messageCache[input.message_id]
          .map((chunk) => chunk.content)
          .join('');

        // Decode message
        console.debug(CONSOLE_LOG_PREFIX, '[message]', atob(message));

        const decodedMessage = JSON.parse(atob(message));

        console.debug(CONSOLE_LOG_PREFIX, '[decodedMessage]', decodedMessage);

        // Callback
        callback?.(decodedMessage);

        // Delete cache
        delete this._messageCache[input.message_id];
      }
    } catch (error) {
      console.error(CONSOLE_LOG_PREFIX, 'handleChunk error', error);
      return;
    }
  }

  _pushToQueue(data) {
    const targetQueueItem = this._queue.find(
      (item) => item.turn_id === data.turn_id && item.stream_id === data.stream_id
    );
    
    // If not found, push to queue
    if (!targetQueueItem) {
      const newQueueItem = {
        turn_id: data.turn_id,
        text: data.text,
        words: this.sortWordsWithStatus(data.words, data.status),
        status: data.status,
        stream_id: data.stream_id,
        message_id: data.message_id,
        user_id: data.user_id // Include user_id
      };
      
      console.debug(
        CONSOLE_LOG_PREFIX,
        'Push to queue',
        JSON.stringify(newQueueItem)
      );
      
      // Push to queue
      this._queue.push(newQueueItem);
      return;
    }
    
    // If found, update text, words (sorted with status) and turn_status
    console.debug(
      CONSOLE_LOG_PREFIX,
      'Update queue item',
      JSON.stringify({ 
        turn_id: targetQueueItem.turn_id,
        status: targetQueueItem.status
      }),
      JSON.stringify({
        turn_id: data.turn_id,
        status: data.status
      })
    );
    
    targetQueueItem.text = data.text;
    targetQueueItem.user_id = data.user_id || targetQueueItem.user_id; // Update user_id if provided
    
    // Merge words lists and sort
    if (data.words && data.words.length > 0) {
      targetQueueItem.words = this.sortWordsWithStatus(
        [...targetQueueItem.words || [], ...data.words],
        data.status
      );
    }
    
    // Only update status if the new status is "more final"
    if (targetQueueItem.status === MessageStatus.IN_PROGRESS || 
        data.status === MessageStatus.INTERRUPTED) {
      targetQueueItem.status = data.status;
    }
  }

  _handleQueue() {
    const queueLength = this._queue.length;
    
    // Empty queue, skip
    if (queueLength === 0) {
      return;
    }
    
    const curPTS = this._pts;
    
    // Process all items in the queue
    for (let i = 0; i < this._queue.length; i++) {
      const queueItem = this._queue[i];
      this._handleTurnObj(queueItem, curPTS);
    }
    
    // Remove completed items from queue
    this._queue = this._queue.filter(item => 
      item.status === MessageStatus.IN_PROGRESS
    );
    
    this._mutateChatHistory();
  }

  _interruptQueue(options) {
    const turn_id = options.turn_id;
    
    // Find and mark all queue items matching this turn_id as interrupted
    this._queue.forEach(item => {
      if (item.turn_id === turn_id) {
        item.status = MessageStatus.INTERRUPTED;
        
        // Mark all words as interrupted too
        if (item.words && item.words.length > 0) {
          item.words.forEach(word => {
            word.word_status = MessageStatus.INTERRUPTED;
          });
        }
      }
    });
  }

  _handleTurnObj(queueItem, curPTS) {
    // Find or create corresponding chat history item
    let correspondingChatHistoryItem = this.messageList.find(
      (item) =>
        item.turn_id === queueItem.turn_id && item.uid === queueItem.stream_id
    );
    
    // Simplified logging - just basic info
    console.debug(
      CONSOLE_LOG_PREFIX,
      `Processing turn ${queueItem.turn_id} (status: ${queueItem.status})`
    );
    
    if (!correspondingChatHistoryItem) {
      correspondingChatHistoryItem = {
        turn_id: queueItem.turn_id,
        uid: queueItem.stream_id,
        _time: Date.now(),
        text: queueItem.text || '', // Use the text from queueItem immediately
        status: queueItem.status,
        metadata: queueItem,
        message_id: queueItem.message_id,
        user_id: queueItem.user_id || queueItem.stream_id // Use user_id from queue item
      };
      
      this._appendChatHistory(correspondingChatHistoryItem);
    } else {
      // Update existing message
      correspondingChatHistoryItem._time = Date.now();
      correspondingChatHistoryItem.metadata = queueItem;
      correspondingChatHistoryItem.text = queueItem.text || correspondingChatHistoryItem.text;
      correspondingChatHistoryItem.user_id = queueItem.user_id || correspondingChatHistoryItem.user_id || queueItem.stream_id; // Update user_id if provided
      
      // Update status if needed (only transition to more "final" states)
      if (queueItem.status !== MessageStatus.IN_PROGRESS) {
        correspondingChatHistoryItem.status = queueItem.status;
      }
    }
    
    // If we have words, process them based on PTS
    if (queueItem.words && queueItem.words.length > 0) {
      const validWords = queueItem.words.filter(word => word.start_ms <= curPTS);
      
      if (validWords.length > 0) {
        // Use text from queueItem.text rather than reconstructing from words
        // This generally provides better results
        correspondingChatHistoryItem.text = queueItem.text;
      }
      
      // Check if all words have been processed and the last word has a final status
      const allWordsProcessed = validWords.length === queueItem.words.length;
      const lastWordFinal = validWords.length > 0 && 
                            validWords[validWords.length - 1].word_status !== MessageStatus.IN_PROGRESS;
                            
      if (allWordsProcessed && lastWordFinal) {
        correspondingChatHistoryItem.status = queueItem.status;
      }
    }
    
    // For messages that don't use words, rely on the queue item status
    if (!queueItem.words || queueItem.words.length === 0) {
      correspondingChatHistoryItem.status = queueItem.status;
    }
  }

  _mutateChatHistory() {
    // Simplified logging - just count of messages
    console.debug(
      CONSOLE_LOG_PREFIX,
      `Updated message list (${this.messageList.length} messages)`
    );
    
    // Sort messages by time for consistent display
    this.messageList.sort((a, b) => a._time - b._time);
    
    // Always make a new copy of the array to ensure React detects the change
    if (this.onMessageListUpdate) {
      const messageListCopy = [...this.messageList];
      this.onMessageListUpdate(messageListCopy);
    }
  }
}