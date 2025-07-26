/**
 * Generate a random 8-character string for channel name
 *
 * @returns {string} Random 8-character string
 */
export const generateRandomChannelName = () => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

/**
 * Get parameters from URL query string
 *
 * @returns {Object} Object containing URL parameters
 */
export const getParamsFromUrl = () => {
  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    const channelParam = urlParams.get("channel");
    const avatarIdParam = urlParams.get("avatarId");
    const trulienceSdkURL = urlParams.get("trulienceSdkURL");
    const voiceIdParam = urlParams.get("voice_id");
    const promptParam = urlParams.get("prompt");
    const greetingParam = urlParams.get("greeting");
    const profileParam = urlParams.get("profile");
    const nameParam = urlParams.get("name"); // Add name parameter
    const continueParam = urlParams.get("continue");
    const continueDelayParam = urlParams.get("continueDelay");
    const endpointParam = urlParams.get("endpoint");
    const purechatParam = urlParams.get("purechat");
    const skinParam = urlParams.get("skin");
    
    // Add new content parameters
    const contentTypeParam = urlParams.get("contentType");
    const contentUrlParam = urlParams.get("contentURL");
    const contentAltParam = urlParams.get("contentALT");
    const contentLayout = urlParams.get("contentLayout"); // wide | default

    const avatarOverlayHeight = urlParams.get("avatarOverlayHeight");
    const avatarOverlayWidth = urlParams.get("avatarOverlayWidth");
    const avatarOverlayBottom = urlParams.get("avatarOverlayBottom");
    const avatarOverlayRight = urlParams.get("avatarOverlayRight");
    

    // Log when parameters are overridden from URL
    if (channelParam) {
      console.log(`Using channelName from URL: ${channelParam}`);
    }

    if (avatarIdParam) {
      console.log(`Using avatarId from URL: ${avatarIdParam}`);
    }

    if (voiceIdParam) {
      console.log(`Using voice_id from URL: ${voiceIdParam}`);
    }

    if (promptParam) {
      console.log(`Using custom prompt from URL`);
    }

    if (greetingParam) {
      console.log(`Using custom greeting from URL`);
    }

    if (profileParam) {
      console.log(`Using custom profile from URL`);
    }

    if (nameParam) {
      console.log(`Using name from URL: ${nameParam}`);
    }

    if (endpointParam) {
      console.log(`Using custom endpointParam from URL`);
    }
    
    if (continueParam) {
      console.log(`Using continue parameter from URL: ${continueParam}`);
    }

    if (continueDelayParam) {
      console.log(`Using continue delay from URL: ${continueDelayParam}ms`);
    }

    if (purechatParam) {
      console.log(`Pure chat mode enabled: ${purechatParam}`);
    }
    
    if (skinParam) {
      console.log(`Using skin from URL: ${skinParam}`);
    }
    
    // Log new content parameters
    if (contentTypeParam) {
      console.log(`Using content type from URL: ${contentTypeParam}`);
    }
    
    if (contentUrlParam) {
      console.log(`Using content URL from URL: ${contentUrlParam}`);
    }

    // Parse continue delay with default fallback
    const continueDelay = continueDelayParam ? parseInt(continueDelayParam, 10) : null;

    return {
      channelName: channelParam || process.env.REACT_APP_AGORA_CHANNEL_NAME,
      avatarId: avatarIdParam || process.env.REACT_APP_TRULIENCE_AVATAR_ID,
      trulienceSdkURL: trulienceSdkURL || process.env.REACT_APP_TRULIENCE_SDK_URL,
      voice_id: voiceIdParam || null, // Changed from voiceId to voice_id for consistency
      prompt: promptParam || null,
      greeting: greetingParam || null,
      profile: profileParam || null,
      name: nameParam || null, // Add name to returned object
      continue: continueParam || null,
      continueDelay: continueDelay, // New parameter for continue delay in ms
      purechat: purechatParam === "true",
      skin: skinParam || "whatsapp", // Default to whatsapp skin
      // Add new content parameters to the returned object
      contentType: contentTypeParam || null,
      contentURL: contentUrlParam || null,
      contentALT: contentAltParam || null,
      contentLayout: contentLayout || "default",
      avatarOverlayHeight: avatarOverlayHeight,
      avatarOverlayWidth,
      avatarOverlayBottom,
      avatarOverlayRight,
      endpoint: endpointParam || null
    };
  }
  return {
    channelName: process.env.REACT_APP_AGORA_CHANNEL_NAME,
    avatarId: process.env.REACT_APP_TRULIENCE_AVATAR_ID,
    voice_id: null, // Changed from voiceId to voice_id for consistency
    prompt: null,
    greeting: null,
    profile: null,
    name: null, // Add name to default return object
    continue: null,
    continueDelay: null, // New parameter for continue delay in ms
    purechat: false,
    skin: "whatsapp", // Default to whatsapp skin
    contentType: null,
    contentURL: null,
    contentALT: null,
    endpoint: null
  };
};