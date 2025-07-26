import { useState, useEffect, useCallback } from "react";

export const useContentManager = (isConnectInitiated) => {
  const [isContentMode, setIsContentMode] = useState(false);
  const [contentData, setContentData] = useState(null);

  const VIDEO_ELEMENT_ID = "video-content";

  // Get video element with error handling
  const getVideoElement = useCallback(() => {
    const videoEl = document.getElementById(VIDEO_ELEMENT_ID);
    if (!videoEl) {
      console.warn(`Video element with ID '${VIDEO_ELEMENT_ID}' not found`);
    }
    return videoEl;
  }, []);


  // Show/hide content with optional data
  const showContent = useCallback((data = null) => {
    setIsContentMode(true);
    if (data) {
      setContentData(data);
    }
  }, []);

  const hideContent = useCallback(() => {
    setIsContentMode(false);
    // setContentData(null);
  }, []);


  // Video playback with improved error handling and state management
  const playVideo = useCallback(async () => {
    const videoEl = getVideoElement();
    if (!videoEl) return false;

    try {
      videoEl.currentTime = 0;
      
      // Wait for seek to complete before playing
      await new Promise((resolve) => {
        const handleSeeked = () => {
          videoEl.removeEventListener('seeked', handleSeeked);
          resolve();
        };
        videoEl.addEventListener('seeked', handleSeeked);
      });

      await videoEl.play();
      return true;
    } catch (error) {
      const errorMessage = `Video playback failed: ${error.message}`;
      console.error(errorMessage, error);
      return false;
    }
  }, [getVideoElement]);

  const unlockVideo = useCallback(async () => {
    const videoEl = getVideoElement();
    if (!videoEl) return false;

    try {      
      // Play and immediately pause to unlock video on iOS
      videoEl.muted = true; // Ensure it's muted for autoplay policies
      await videoEl.play();
      videoEl.pause();
      videoEl.currentTime = 0;
      
      console.log('Video unlocked for programmatic control');
      return true;
    } catch (error) {
      console.error('Failed to unlock video:', error);
      return false;
    }
  }, [getVideoElement]);

  // Combined actions
  const showContentAndPlayVideo = useCallback(async (data = null) => {
    showContent(data);
    return await playVideo();
  }, [showContent, playVideo]);

  // Expose showContent & playVideo globally
  useEffect(() => {
    window.contentMode = {
      playVideo,
    };
    return () => {
      delete window.contentMode;
    };
  }, [playVideo]);

  
  return {
    isContentMode,
    contentData,
    setContentData,
    playVideo,
    showContentAndPlayVideo,

    showContent,
    hideContent,
    unlockVideo
  };
};
