import { useEffect, useState } from "react";

export default function useOrientationListener() {
  const [orientation, setOrientation] = useState(
      window.innerHeight > window.innerWidth ? "portrait" : "landscape"
    );
  
  // Monitor window orientation changes
  useEffect(() => {
    const handleResize = () => {
      setOrientation(
        window.innerHeight > window.innerWidth ? "portrait" : "landscape"
      );
    };

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return orientation;
}