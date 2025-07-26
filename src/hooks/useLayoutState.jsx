import { useMemo } from "react";

export const LAYOUT_TYPES = {
  DEFAULT: "default", // Content on top-left (60%), avatar at bottom, chat on right
  WIDE: "wide", // Full-width content, avatar and chat displayed at the bottom
  WIDE_OVERLAY: "wideOverlay", // Full-width content, avatar floats (overlay), chat at bottom
  AVATAR_OVERLAY: "avatarOverlay" // 75% width content, avatar overlays content, chat on left
};

const useLayoutState = (contentManager, urlParams, orientation) => {
  const isMobileView = orientation === "portrait";
  const contentLayout = urlParams.contentLayout ?? LAYOUT_TYPES.DEFAULT;
  
  return useMemo(() => {
    const isContentLayoutWide = contentManager.isContentMode && ["wide"].includes(contentLayout) && !isMobileView 
    const isContentLayoutWideOverlay = contentManager.isContentMode && ["wideOverlay"].includes(contentLayout) && !isMobileView 
    const isContentLayoutDefault = contentManager.isContentMode && !isContentLayoutWide
    const isAvatarOverlay = contentManager.isContentMode && (["avatarOverlay", "wideOverlay"].includes(contentLayout))

    return {
      isMobileView,
      isAvatarOverlay,
      isContentLayoutWide,
      isContentLayoutDefault,
      isContentLayoutWideOverlay
    };
  }, [contentManager.isContentMode, contentLayout, isMobileView]);
};

export default useLayoutState;
