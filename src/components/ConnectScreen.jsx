import { useEffect, useRef } from "react";
import { ConnectButton, DisconnectButton } from "./ConnectButton";
import { checkIfFullyConnected } from "../utils/connectionState";

const ConnectScreen = ({
  avatarId,
  onConnect,
  onHangUp,
  isPureChatMode,
  connectionState,
  getProfileImage // New prop for getting profile image
}) => {
  const audioRef = useRef(null);
  const ringToneUrl = "/ring-tone.mp3";

  const isConnected = checkIfFullyConnected(connectionState);
  const isRinging = connectionState.app.connectInitiated && !isConnected;

  const playRingTone = () => {
    if (audioRef.current) {
      audioRef.current.volume = 0.1;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((error) => {
        console.error("Audio play failed:", error);
      });
    }
  };

  useEffect(() => {
    let ringInterval;
    const audioElement = audioRef.current;

    if (isRinging && !connectionState.rtm.connected) {
      playRingTone();
    }

    return () => {
      if (ringInterval) {
        clearInterval(ringInterval);
      }
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
    };
  }, [isRinging, connectionState.rtm.connected]);

  // Get profile image URL
  const getProfileImageUrl = () => {
    if (getProfileImage) {
      return getProfileImage();
    }
    
    // For Anam, use a default avatar or get from configuration
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='8' r='5'/%3E%3Cpath d='M20 21a8 8 0 0 0-16 0'/%3E%3C/svg%3E";
  };

  return (
    <div className="connect-button-container">
      <div className="profile-container">
        {isRinging && (
          <>
            <div className="pulse-ring-1"></div>
            <div className="profile-overlay">Calling...</div>
          </>
        )}

        <img
          src={getProfileImageUrl()}
          alt="Avatar Profile"
          className="avatar-profile-image"
          onError={(e) => {
            // Fallback if the image fails to load
            e.target.src =
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='8' r='5'/%3E%3Cpath d='M20 21a8 8 0 0 0-16 0'/%3E%3C/svg%3E";
            e.target.style.backgroundColor = "#444";
          }}
        />
      </div>

      {isRinging ? (
        <DisconnectButton onClick={onHangUp} />
      ) : (
        <ConnectButton
          onClick={onConnect}
          isPureChatMode={isPureChatMode}
        />
      )}

      {/* Hidden audio element for ring tone */}
      <audio ref={audioRef} preload="auto" loop={true}>
        <source src={ringToneUrl} type="audio/mpeg" />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

export default ConnectScreen;