/**
 * Finds all Trulience commands in a text string
 * This handles both standalone commands and commands embedded in text
 * 
 * @param {string} text - Text to search for commands
 * @returns {string[]} Array of found commands
 */
const findTrulienceCommands = (text) => {
  if (!text || typeof text !== 'string') return [];
  
  const result = [];
  let startIndex = text.indexOf("<trl");
  
  while (startIndex >= 0) {
    // Find the end of this command
    const selfClosingEnd = text.indexOf("/>", startIndex);
    const openingTagEnd = text.indexOf(">", startIndex);
    
    // Determine what kind of tag this is and where it ends
    if (selfClosingEnd >= 0 && (openingTagEnd < 0 || selfClosingEnd < openingTagEnd + 1)) {
      // It's a self-closing tag
      result.push(text.substring(startIndex, selfClosingEnd + 2));
      startIndex = text.indexOf("<trl", selfClosingEnd);
    } else if (openingTagEnd >= 0) {
      // It's an opening tag, find its closing tag
      const tagName = text.substring(startIndex + 1, text.indexOf(" ", startIndex) || openingTagEnd);
      const closingTag = "</" + tagName + ">";
      const closingTagIndex = text.indexOf(closingTag, openingTagEnd);
      
      if (closingTagIndex >= 0) {
        result.push(text.substring(startIndex, closingTagIndex + closingTag.length));
        startIndex = text.indexOf("<trl", closingTagIndex);
      } else {
        // No closing tag found, must be malformed
        startIndex = text.indexOf("<trl", openingTagEnd);
      }
    } else {
      // Malformed tag, move on
      startIndex = text.indexOf("<trl", startIndex + 1);
    }
  }
  
  return result;
};

/**
 * Process message for commands and returns processed message
 * 
 * @param {string} message - Original message text
 * @param {function} commandHandler - Function to handle extracted commands
 * @param {string|number} contextId - Context ID for deduplication (e.g., turn_id)
 * @returns {string} Processed message with commands removed
 */
export function processMessageCommands(message, commandHandler, contextId = "") {
  if (!message || typeof message !== 'string' || !commandHandler) {
    return message;
  }
  
  // Find all commands in the message
  const commands = findTrulienceCommands(message);
  if (commands.length === 0) {
    return message;
  }
  
  // Process each command
  let cleanedText = message;
  commands.forEach(command => {
    commandHandler(command);    
    // Remove the command from the text
    cleanedText = cleanedText.replace(command, '');
  });
  
  return cleanedText.trim();
}