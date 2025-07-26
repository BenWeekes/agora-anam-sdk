/**
 * Decodes a stream message from Uint8Array to string
 * @param {Uint8Array} stream - The stream to decode
 * @returns {string} The decoded message
 */
export function decodeStreamMessage(stream) {
    const decoder = new TextDecoder();
    return decoder.decode(stream);
  }
  
  /**
   * Generates a random UUID
   * @returns {string} A random UUID
   */
  export const genUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };
  
  /**
   * Normalizes frequency values for audio visualization
   * @param {Float32Array} frequencies - Array of frequency values
   * @returns {Float32Array} Normalized frequency values
   */
  export const normalizeFrequencies = (frequencies) => {
    const normalizeDb = (value) => {
      const minDb = -100;
      const maxDb = -10;
      const db = 1 - (Math.min(Math.max(value, minDb), maxDb) * -1) / 100;
      return Math.sqrt(db);
    };
    
    // Normalize all frequency values
    const normalizedArray = new Float32Array(frequencies.length);
    for (let i = 0; i < frequencies.length; i++) {
      const value = frequencies[i];
      normalizedArray[i] = value === -Infinity ? 0 : normalizeDb(value);
    }
    return normalizedArray;
  };