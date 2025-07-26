// src/hooks/useAppConfig.js
import { useState, useMemo, useEffect } from "react";
import { getParamsFromUrl, generateRandomChannelName } from "../utils/agoraUtils";
import { NativeBridge } from "../utils/nativeBridge";

export const useAppConfig = () => {
  const urlParams = useMemo(() => getParamsFromUrl(), []);
  const nativeBridge = useMemo(() => new NativeBridge(), []);

  const [agoraConfig, setAgoraConfig] = useState(() => ({
    appId: process.env.REACT_APP_AGORA_APP_ID,
    channelName: urlParams.channelName ?? process.env.REACT_APP_AGORA_CHANNEL_NAME,
    token: process.env.REACT_APP_AGORA_TOKEN || null,
    uid: process.env.REACT_APP_AGORA_UID || null,
    voice_id: urlParams.voice_id || null,
    prompt: urlParams.prompt || null,
    greeting: urlParams.greeting || null,
    profile: urlParams.profile || null,
    name: urlParams.name || null,
    endpoint: urlParams.endpoint ?? process.env.REACT_APP_AGENT_ENDPOINT,
  }));

  const derivedChannelName = useMemo(() => {
    if (agoraConfig.channelName === "random") {
      return generateRandomChannelName();
    }
    return agoraConfig.channelName;
  }, [agoraConfig.channelName]);

  // Debugging logs
  useEffect(() => {
    if (!process.env.REACT_APP_AGORA_APP_ID) {
      console.error(
        "Missing Agora App ID. Set REACT_APP_AGORA_APP_ID in your .env file"
      );
    }
    console.log("URL Parameters:", urlParams);
    console.log("Continue param:", urlParams.continue);
    console.log("Content params:", {
      type: urlParams.contentType,
      url: urlParams.contentURL,
      alt: urlParams.contentALT
    });
  }, [urlParams]);

  useEffect(() => {
    const handleAgoraDetailsUpdated = (data) => {
      const { appId, channelName, uid, voice_id, prompt, greeting, profile, name, endpoint } = data;
      setAgoraConfig(_agoraConfig => ({
        ..._agoraConfig,
        appId,
        channelName,
        uid,
        voice_id,
        prompt,
        greeting,
        profile,
        name,
        endpoint
      }));
    };

    if (nativeBridge) {
      nativeBridge.on("agoraDetailsUpdated", handleAgoraDetailsUpdated);
    }

    return () => {
      if (nativeBridge) {
        nativeBridge.off("agoraDetailsUpdated", handleAgoraDetailsUpdated);
      }
    };
  }, [nativeBridge]);

  return {
    urlParams,
    agoraConfig,
    setAgoraConfig,
    derivedChannelName,
  };
};