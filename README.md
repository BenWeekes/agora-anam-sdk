# Agora-Anam Avatar Demo

A React application that demonstrates integration between Agora RTC/RTM and Anam.ai Avatar SDK.

## Features

- Real-time audio streaming with Agora RTC
- Text messaging with Agora RTM
- AI avatar visualization with Anam.ai SDK
- Custom LLM integration support

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- NPM or Yarn

### Installation

1. Clone the repository:

   ```
   git clone https://github.com/yourusername/agora-anam-demo.git
   cd agora-anam-demo
   ```

2. Install dependencies:

   ```
   npm install --legacy-peer-deps
   ```

3. Create a `.env` file in the project root:

   ```
   # Agora configuration
   REACT_APP_AGENT_ENDPOINT=your_agent_endpoint
   REACT_APP_AGORA_APP_ID=your_agora_app_id
   REACT_APP_AGORA_CHANNEL_NAME=your_channel_name
   ```

### Running the Application

Start the development server:

```
npm run start
```

The application will be available at [http://localhost:3040](http://localhost:3040).

## Usage

1. Open the application in your browser
2. Click the play button to connect to the Agora channel
3. The Anam avatar will appear and respond to text messages
4. Use the microphone button in the bottom right to mute/unmute your microphone

## Agent Endpoint Requirements

Your agent endpoint should return:
- Agora tokens and configuration
- Anam session token in the response as `anam_session_token`

Example response:
```json
{
  "user_token": {
    "token": "agora_token",
    "uid": 12345
  },
  "anam_session_token": "your_anam_session_token",
  "agent_response": {
    "status_code": 200
  }
}
```

## Building for Production

To create a production build:

```
npm run build
```

The build files will be created in the `build` directory.

## License

[MIT](LICENSE)