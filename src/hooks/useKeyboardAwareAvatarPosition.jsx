import React from "react";
import * as rdd from "react-device-detect";

function useKeyboardAwareAvatarPosition(
  containerElementId,
  setVideoSize,
  onKeyboardStateChange = () => {}
) {
  const MainVideoContainer = containerElementId;
  const InputBoxContainer = "input-box-container";

  const prevVideoHeightRef = React.useRef(0);
  const isAvatarPositionShiftedRef = React.useRef(false);

  /** Prevent avatar from disappearing off the top of the screen when the keyboard is opened  */
  React.useEffect(() => {
    let pendingUpdate = false;
    let timerId = null;
    
    const getTransform = (x, y) => `translate(${x}px, ${y}px)`;

    const viewportHandler = (event) => {
      // Skip if landscape and avatar position was not shifted
      const isLandscape = window.matchMedia("(orientation: landscape)").matches;
      if (isLandscape && !isAvatarPositionShiftedRef.current) return;

      if (pendingUpdate) return;
      pendingUpdate = true;

      requestAnimationFrame(() => {
        pendingUpdate = false;
        const mainWindowContainer = document.getElementById(MainVideoContainer);
        const inputBoxContainer = document.getElementById(InputBoxContainer);

        // visual viewport's offset from the layout viewport origin.
        const viewport = event.target;
        // Get offset height
        const offsetTop = viewport.offsetTop;

        // Threshold value for detecting keyboard opening, can vary - TODO: find best solution for iOS to detect the keyboard is open
        const threshold = 40;
        const isKeyboardOpen =
          offsetTop > threshold || window.innerHeight > event.target.height;
        
        // if keyboard is open means avatar position is shifted down
        isAvatarPositionShiftedRef.current = isKeyboardOpen;
        
        onKeyboardStateChange && onKeyboardStateChange(isKeyboardOpen);

        if (window.innerHeight > event.target.height && rdd.isIOS) {
          // sometime keyboard doesn't slide the page up, so we need to move the chat input box up on iOS
          timerId = setTimeout(() => {
            if (inputBoxContainer)
              inputBoxContainer.style.transform = getTransform(
                0,
                event.target.height - window.innerHeight
              );
          }, 100); // add some delay
        } else {
          clearTimeout(timerId);
          if (inputBoxContainer)
            inputBoxContainer.style.transform = getTransform(0, 0);

          // setting top padding to make main video visible
          mainWindowContainer.style.transform = isKeyboardOpen ? getTransform(0, offsetTop) : "unset";
          mainWindowContainer.style.zIndex = 10000;
        }

        const messageInputBoxHeight = 62;
        const newVideoHeight = viewport.height - messageInputBoxHeight;

        if (!isKeyboardOpen && inputBoxContainer) {
          // move the chat input box to original position
          inputBoxContainer.style.transform = getTransform(0, 0);
        }

        if (setVideoSize) {
          setVideoSize((prev) => {
            // Set the video height before keyboard opens
            if (prevVideoHeightRef.current < prev.height) {
              prevVideoHeightRef.current = prev.height;
            }

            // case 1 - when keyboard is closed - apply prev video height
            if (!isKeyboardOpen) {
              const height = prevVideoHeightRef.current;
              prevVideoHeightRef.current = 0;
              return { ...prev, height: height };
            }

            // case 2 - if video height is greater viewport height - set available Height
            return { ...prev, height: newVideoHeight };
          });
        }
      });
    }

    // window.visualViewport.addEventListener("resize", viewportHandler);
    window.visualViewport.addEventListener("scroll", viewportHandler);
    
    return () => {
      // window.visualViewport.removeEventListener("resize", viewportHandler);
      window.visualViewport.removeEventListener("scroll", viewportHandler);
    };
  }, []);
}

export default useKeyboardAwareAvatarPosition;
