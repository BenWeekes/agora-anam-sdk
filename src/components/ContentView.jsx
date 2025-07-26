const ContentViewer = ({ contentData, style }) => {  
  if(!contentData) return null

  return (
    <div 
      className="content-container" 
      style={style}
      >
      {contentData.type === "image" && (
        <img 
          src={contentData.url} 
          alt={contentData.alt || "Content"} 
          className="content-image"
        />
      )}

      {contentData.type === "video" && (
        <video 
          id="video-content"
          src={contentData.url}
          className="content-video"
          // Critical iOS attributes
          playsInline
          webkit-playsinline="true"
          x-webkit-airplay="allow"
          // Autoplay and controls
          autoPlay={true}
          controls={false}
          muted
          loop
          // Loading optimization
          preload="metadata"
          // Additional iOS fixes
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          // Styling to hide controls completely
          style={{
            WebkitAppearance: 'none',
            appearance: 'none',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent'
          }}
          // Prevent context menu
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
    </div>
  );
};

export default ContentViewer;
