import React from "react";

/**
 * Component for the connect button displaying a WhatsApp-style video call icon
 */
export const ConnectButton = ({ onClick, isPureChatMode = false }) => {
  // Log when button is clicked to verify handler is working
  const handleClick = () => {
    if (onClick && typeof onClick === "function") {
      onClick();
    }
  };

  const getButtonText = () => {
    return isPureChatMode ? "Connect to Avatar" : "Video Call";
  };

  return (
    <button
      className="connect-button video-call"
      onClick={handleClick}
      title={getButtonText()}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M23 7l-7 5 7 5V7z"></path>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
      </svg>
    </button>
  );
};

export const DisconnectButton = ({ onClick }) => {
  return (
    <button
      className="connect-button video-call hangup-button"
      title="End call"
      onClick={onClick}
      style={{
        height: "64px",
        width: "64px",
        zIndex: 10000000,
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
      </svg>
    </button>
  );
};
