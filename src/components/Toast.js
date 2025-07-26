import React, { useCallback, useEffect, useRef, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState({
    visible: false,
    title: "",
    details: null,
    isError: false,
  });

  const toastTimeoutRef = useRef(null);

  const showToast = useCallback((title, details = null, isError = false) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    setToast({
      visible: true,
      title,
      details,
      isError,
    });

    toastTimeoutRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 3000);
  }, []);

  const hideToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  return {
    toast,
    showToast,
    hideToast,
  };
}

/**
 * Component for toast notifications
 */
export const Toast = ({ visible, title, details, isError }) => {
  if (!visible) return null;

  return (
    <div className={`toast-notification ${isError ? "toast-error" : "toast-success"}`}>
      <div className="toast-title">{title}</div>
      {details && <div className="toast-details">{details}</div>}
    </div>
  );
};
