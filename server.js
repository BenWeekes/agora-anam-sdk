const express = require('express');
const compression = require('compression');
const path = require('path');
const app = express();

// Enable gzip compression
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  threshold: 1024, // Only compress files larger than 1KB
  level: 6 // Compression level (1-9, 6 is good balance)
}));

// Serve static files with proper caching headers
app.use(express.static(path.join(__dirname, 'build'), {
  maxAge: '1y',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Cache JS and CSS files aggressively
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // Cache images for a shorter time
    else if (filePath.match(/\.(jpg|jpeg|png|gif|ico|svg|webp)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    }
    // Cache fonts
    else if (filePath.match(/\.(woff|woff2|ttf|eot)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// For any request that doesn't match one of our static files, send index.html
app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 3040;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} with compression enabled`);
});
