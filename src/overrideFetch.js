import { getBase64Data } from "./BUNDLED/index.js";

/**
 * Converts a Base64 string to a Uint8Array.
 * @param {string} base64 - The Base64-encoded string.
 * @returns {Uint8Array} The decoded bytes.
 */
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Save the original fetch function.
const originalFetch = window.fetch;

// Override fetch to intercept requests to our special URL.
window.fetch = function (input, init) {
  // Determine the URL from the input.
  const requestUrl = typeof input === "string" ? input : input.url;
  const base64Data = getBase64Data(requestUrl);
  if (base64Data) {
    console.log("Intercepting special URL for on-the-fly model data load");

    // Convert the Base64 string to a Uint8Array.
    const buffer = base64ToUint8Array(base64Data);

    // Create a Response object containing the binary data.
    const responseInit = {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": "application/octet-stream",
        // Do not include Content-Encoding unless the data is actually compressed.
      },
    };
    return Promise.resolve(new Response(buffer, responseInit));
  } else {
    // For any other URL, call the original fetch.
    return originalFetch(input, init);
  }
};
