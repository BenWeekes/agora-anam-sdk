// react/src/utils/messageService.js - Updated for Anam integration
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
 * Modified for Anam integration - processes messages for avatar speech
 */
export class MessageEngine {
  constructor(rtcEngine, renderMode, callback, urlParams = {}, messageProcessor = null) {
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
    this._processedMessageIds = new Set();
    this._urlParams = urlParams;
    this._messageProcessor = messageProcessor; // Function to send messages to Anam avatar

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
    return messageText.trim() === this._urlParams.continue.trim();
  }

  handleMessage(message) {
    if (message.message_id && this._processedMessageIds.has(message.message_id)) {
      console.warn(CONSOLE_LOG_PREFIX, 'Skipping already processed message:', message.message_id);
      return;
    }

    if (message.message_id) {
      this._processedMessageIds.add(message.message_id);
    }
    
    console.debug(CONSOLE_LOG_PREFIX, 'Processing message:', 
      message.object, 
      message.turn_id, 
      message.message_id,
      message.text?.slice(0, 30) + (message.text?.length > 30 ? '...' : '')
    );

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
      return;
    }

    // Send agent messages to Anam avatar if processor is available
    if (isAgentMessage && this._messageProcessor && message.text && message.final) {
      console.log("Sending agent message to Anam avatar:", message.text);
      this._messageProcessor(message.text, message.turn_id || "");
    }

    if (isUserMessage && window.clearContinueMessageTimeout) {
      console.log("New user message detected in messageService, clearing continue timeout");
      window.clearContinueMessageTimeout();
    }
    
    if (isAgentMessage && this._mode === MessageEngineMode.AUTO) {
      if (!message.words) {
        this.setMode(MessageEngineMode.TEXT);
      } else {
        this.setupInterval();
        this.setMode(MessageEngineMode.WORD);
      }
    }
    
    if (isAgentMessage) {
      if (this._mode === MessageEngineMode.WORD) {
        this.handleWordAgentMessage(message);
      } else {
        this.handleTextMessage(message);
      }
      return;
    }
    
    if (isUserMessage) {
      this.handleTextMessage(message);
      return;
    }
    
    if (isMessageInterrupt) {
      this.handleMessageInterrupt(message);
      return;
    }
  }

  _getValidTimestamp(timestamp) {
    if (!timestamp || isNaN(timestamp) || new Date(timestamp).getFullYear() <= 1971) {
      return Date.now();
    }
    return timestamp;
  }

  handleTextMessage(message) {
    if (this._isContinueMessage(message.text)) {
      console.log("Filtered out continue message from text processing:", message.text);
      return;
    }

    const turn_id = message.turn_id;
    const text = message.text || '';
    const stream_id = message.stream_id || message.user_id;
    const isFinal = message.final === true || message.turn_status === MessageStatus.END;
    const status = isFinal ? MessageStatus.END : MessageStatus.IN_PROGRESS;
    const message_id = message.message_id;
    const user_id = message.user_id || stream_id;
    
    console.debug(message);
    const validTime = this._getValidTimestamp(message.start_ms || message._time);

    const existingMsgIndex = this.messageList.findIndex(
      (item) => item.turn_id === turn_id && item.uid === stream_id
    );
    
    if (existingMsgIndex >= 0) {
      const existingMsg = this.messageList[existingMsgIndex];
      
      if (existingMsg.text !== text || existingMsg.status !== status) {
        this.messageList[existingMsgIndex] = {
          ...existingMsg,
          text,
          status,
          _time: validTime,
          metadata: message,
          message_id,
          user_id: user_id
        };
        
        this._mutateChatHistory();
      }
    } else {
      this._appendChatHistory({
        turn_id,
        uid: stream_id,
        _time: validTime,
        text,
        status,
        metadata: message,
        message_id,
        user_id: user_id
      });
      
      this._mutateChatHistory();
    }
  }

  _appendChatHistory(item) {
    if (item.message_id && 
        this.messageList.some(msg => msg.message_id === item.message_id)) {
      return;
    }

    item._time = this._getValidTimestamp(item._time);
    
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
    
    const msgToInterrupt = this.messageList.find(
      (item) => item.turn_id === turn_id && item.status === MessageStatus.IN_PROGRESS
    );
    
    if (msgToInterrupt) {
      msgToInterrupt.status = MessageStatus.INTERRUPTED;
      this._mutateChatHistory();
    }
    
    this._interruptQueue({
      turn_id,
      start_ms,
    });
  }

  handleWordAgentMessage(message) {
    if (this._isContinueMessage(message.text)) {
      console.log("Filtered out continue message from word processing:", message.text);
      return;
    }

    const isFinal = message.final === true;
    const status = isFinal ? MessageStatus.END : 
                 (message.turn_status !== undefined ? message.turn_status : MessageStatus.IN_PROGRESS);

    // Send complete messages to Anam avatar
    if (isFinal && this._messageProcessor && message.text) {
      console.log("Sending complete agent message to Anam avatar:", message.text);
      this._messageProcessor(message.text, message.turn_id || "");
    }

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
    const user_id = message.user_id || stream_id;
    
    this._pushToQueue({
      turn_id,
      words,
      text,
      status,
      stream_id,
      message_id: message.message_id,
      user_id
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
    
    this.cleanMessageCache();
    this.teardownInterval();
    this._queue = [];
    this._lastPoppedQueueItem = null;
    this._pts = 0;
    this.messageList = [];
    this._mode = MessageEngineMode.AUTO;
  }

  streamMessage2Chunk(stream) {
    return decodeStreamMessage(stream);
  }

  handleChunk(chunk, callback) {
    try {
      const [msgId, partIdx, partSum, partData] = chunk.split('|');
      
      const input = {
        message_id: msgId,
        part_idx: parseInt(partIdx, 10),
        part_sum: partSum === '???' ? -1 : parseInt(partSum, 10),
        content: partData,
      };
      
      if (input.part_sum === -1) {
        console.debug(
          CONSOLE_LOG_PREFIX,
          'total parts unknown, waiting for further parts.'
        );
        return;
      }

      if (!this._messageCache[input.message_id]) {
        this._messageCache[input.message_id] = [];
        
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
      
      if (
        !this._messageCache[input.message_id]?.find(
          (item) => item.part_idx === input.part_idx
        )
      ) {
        this._messageCache[input.message_id].push(input);
      }
      
      this._messageCache[input.message_id].sort(
        (a, b) => a.part_idx - b.part_idx
      );

      if (this._messageCache[input.message_id].length === input.part_sum) {
        const message = this._messageCache[input.message_id]
          .map((chunk) => chunk.content)
          .join('');

        console.debug(CONSOLE_LOG_PREFIX, '[message]', atob(message));

        const decodedMessage = JSON.parse(atob(message));

        console.debug(CONSOLE_LOG_PREFIX, '[decodedMessage]', decodedMessage);

        callback?.(decodedMessage);

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
    
    if (!targetQueueItem) {
      const newQueueItem = {
        turn_id: data.turn_id,
        text: data.text,
        words: this.sortWordsWithStatus(data.words, data.status),
        status: data.status,
        stream_id: data.stream_id,
        message_id: data.message_id,
        user_id: data.user_id
      };
      
      console.debug(
        CONSOLE_LOG_PREFIX,
        'Push to queue',
        JSON.stringify(newQueueItem)
      );
      
      this._queue.push(newQueueItem);
      return;
    }
    
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
    targetQueueItem.user_id = data.user_id || targetQueueItem.user_id;
    
    if (data.words && data.words.length > 0) {
      targetQueueItem.words = this.sortWordsWithStatus(
        [...targetQueueItem.words || [], ...data.words],
        data.status
      );
    }
    
    if (targetQueueItem.status === MessageStatus.IN_PROGRESS || 
        data.status === MessageStatus.INTERRUPTED) {
      targetQueueItem.status = data.status;
    }
  }

  _handleQueue() {
    const queueLength = this._queue.length;
    
    if (queueLength === 0) {
      return;
    }
    
    const curPTS = this._pts;
    
    for (let i = 0; i < this._queue.length; i++) {
      const queueItem = this._queue[i];
      this._handleTurnObj(queueItem, curPTS);
    }
    
    this._queue = this._queue.filter(item => 
      item.status === MessageStatus.IN_PROGRESS
    );
    
    this._mutateChatHistory();
  }

  _interruptQueue(options) {
    const turn_id = options.turn_id;
    
    this._queue.forEach(item => {
      if (item.turn_id === turn_id) {
        item.status = MessageStatus.INTERRUPTED;
        
        if (item.words && item.words.length > 0) {
          item.words.forEach(word => {
            word.word_status = MessageStatus.INTERRUPTED;
          });
        }
      }
    });
  }

  _handleTurnObj(queueItem, curPTS) {
    let correspondingChatHistoryItem = this.messageList.find(
      (item) =>
        item.turn_id === queueItem.turn_id && item.uid === queueItem.stream_id
    );
    
    console.debug(
      CONSOLE_LOG_PREFIX,
      `Processing turn ${queueItem.turn_id} (status: ${queueItem.status})`
    );
    
    if (!correspondingChatHistoryItem) {
      correspondingChatHistoryItem = {
        turn_id: queueItem.turn_id,
        uid: queueItem.stream_id,
        _time: Date.now(),
        text: queueItem.text || '',
        status: queueItem.status,
        metadata: queueItem,
        message_id: queueItem.message_id,
        user_id: queueItem.user_id || queueItem.stream_id
      };
      
      this._appendChatHistory(correspondingChatHistoryItem);
    } else {
      correspondingChatHistoryItem._time = Date.now();
      correspondingChatHistoryItem.metadata = queueItem;
      correspondingChatHistoryItem.text = queueItem.text || correspondingChatHistoryItem.text;
      correspondingChatHistoryItem.user_id = queueItem.user_id || correspondingChatHistoryItem.user_id || queueItem.stream_id;
      
      if (queueItem.status !== MessageStatus.IN_PROGRESS) {
        correspondingChatHistoryItem.status = queueItem.status;
      }
    }
    
    if (queueItem.words && queueItem.words.length > 0) {
      const validWords = queueItem.words.filter(word => word.start_ms <= curPTS);
      
      if (validWords.length > 0) {
        correspondingChatHistoryItem.text = queueItem.text;
      }
      
      const allWordsProcessed = validWords.length === queueItem.words.length;
      const lastWordFinal = validWords.length > 0 && 
                            validWords[validWords.length - 1].word_status !== MessageStatus.IN_PROGRESS;
                            
      if (allWordsProcessed && lastWordFinal) {
        correspondingChatHistoryItem.status = queueItem.status;
      }
    }
    
    if (!queueItem.words || queueItem.words.length === 0) {
      correspondingChatHistoryItem.status = queueItem.status;
    }
  }

  _mutateChatHistory() {
    console.debug(
      CONSOLE_LOG_PREFIX,
      `Updated message list (${this.messageList.length} messages)`
    );
    
    this.messageList.sort((a, b) => a._time - b._time);
    
    if (this.onMessageListUpdate) {
      const messageListCopy = [...this.messageList];
      this.onMessageListUpdate(messageListCopy);
    }
  }
}