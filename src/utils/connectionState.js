export const initialConnectionState = {
  app: {
    loading: true,
    loaded: false,
    connectInitiated: false
  },
  avatar: {
    ready: false,
    loading: false,
    loaded: false,
    wsConnecting: false,
    wsConnected: false,
  },
  agent: {
    ready: false,
    connecting: false,
    connected: false,
  },
  agora: {
    connecting: false,
    connected: false,
  },
  rtm: {
    connecting: false,
    connected: false,
  }
};

// Enum-like object for action types
export const ConnectionState = {
  APP_LOADED: 'APP_LOADED',
  APP_CONNECT_INITIATED: "APP_CONNECT_INITIATED",

  AVATAR_READY: 'AVATAR_READY',
  AVATAR_LOADING: 'AVATAR_LOADING',
  AVATAR_LOADED: 'AVATAR_LOADED',
  
  AVATAR_WS_CONNECTING: 'AVATAR_WS_CONNECTING',
  AVATAR_WS_CONNECTED: 'AVATAR_WS_CONNECTED',
  AVATAR_WS_DISCONNECT: 'AVATAR_DISCONNECT',
  
  AGENT_READY: 'AGENT_READY',
  AGENT_CONNECTING: 'AGENT_CONNECTING',
  AGENT_CONNECTED: 'AGENT_CONNECTED',
  AGENT_DISCONNECT: 'AGENT_DISCONNECT',
  
  AGORA_CONNECTING: 'AGORA_CONNECTING',
  AGORA_CONNECTED: 'AGORA_CONNECTED',
  AGORA_DISCONNECT: 'AGORA_DISCONNECT',
  
  RTM_CONNECTING: 'RTM_CONNECTING',
  RTM_CONNECTED: 'RTM_CONNECTED',
  RTM_DISCONNECT: 'RTM_DISCONNECT',
  
  DISCONNECT: "DISCONNECT",
  DISCONNECTING: "DISCONNECTING"
};

// Helper function to compute full connection status
export function checkIfFullyConnected(state) {
  return (
    state.avatar.wsConnected &&
    state.avatar.loaded &&
    state.agent.connected &&
    state.agora.connected
  );
}

// Reducer function
/**
 * 
 * @param {typeof initialConnectionState} state 
 * @param {*} action 
 * @returns 
 */
export function connectionReducer(state, action) {
  switch (action) {

    case ConnectionState.APP_LOADED:
      return {
        ...state,
        app: { ...state.app, loading: false, loaded: true },
      };

    case ConnectionState.APP_CONNECT_INITIATED:
      return {
        ...state,
        app: { ...state.app, connectInitiated: true },
      };

    // Avatar state handling
    case ConnectionState.AVATAR_READY: 
      return {
        ...state,
        avatar: { ...state.avatar, ready: true},
      };
    case ConnectionState.AVATAR_LOADING:
      return {
        ...state,
        avatar: { ...state.avatar, loading: true, loaded: false },
      };

    case ConnectionState.AVATAR_LOADED:
      return {
        ...state,
        avatar: { ...state.avatar, loading: false, loaded: true },
      };

    case ConnectionState.AVATAR_WS_CONNECTING:
      return {
        ...state,
        avatar: { ...state.avatar, wsConnecting: true },
      };

    case ConnectionState.AVATAR_WS_CONNECTED: {
      return {
        ...state,
        avatar: { ...state.avatar, wsConnecting: false, wsConnected: true },
      };
    }

    case ConnectionState.AVATAR_WS_DISCONNECT:
      return {
        ...state,
        avatar: { ...state.avatar, wsConnected: false, wsConnecting: false },
      };


    // Agent (LAMBDA Endpoint) state handling
    case ConnectionState.AGENT_READY:
      return { ...state, agent: { ...state.agent, ready: true } };

    case ConnectionState.AGENT_CONNECTING:
      return { ...state, agent: { connecting: true, connected: false } };

    case ConnectionState.AGENT_CONNECTED: {
      return {
        ...state,
        agent: { connecting: false, connected: true },
      };
    }

    case ConnectionState.AGENT_DISCONNECT:
      return {
        ...state,
        agent: { connecting: false, connected: false }
      };


    // Agora RTC state
    case ConnectionState.AGORA_CONNECTING:
      return { ...state, agora: { connecting: true, connected: false } };

    case ConnectionState.AGORA_CONNECTED: {
      return {
        ...state,
        agora: { connecting: false, connected: true },
      };
    }
    case ConnectionState.AGORA_DISCONNECT:
      return {
        ...state,
        agora: { connecting: false, connected: false },
      };

    // RTM
    case ConnectionState.RTM_CONNECTING:
      return { ...state, rtm: { connecting: true, connected: false } };

    case ConnectionState.RTM_CONNECTED: {
      return {
        ...state,
        rtm: { connecting: false, connected: true },
      };
    }
    
    case ConnectionState.RTM_DISCONNECT:
      return {
        ...state,
        rtm: { connecting: false, connected: false }
      };

    case ConnectionState.DISCONNECTING:
      // We are not currently resetting avatar state, as we are keeping it loaded.
      return { 
        ...state,
        app: { ...state.app, connectInitiated: false }
      };

    case ConnectionState.DISCONNECT:
      // We are not currently resetting avatar state, as we are keeping it loaded.
      return { 
        ...state,
        app: { ...state.app, connectInitiated: false },
        rtm: { connecting: false, connected: false },
        agent: { ready: false, connecting: false, connected: false },
        agora: { connecting: false, connected: false },
        avatar: {
          ready: false,
          loading: false,
          loaded: false,
          wsConnecting: false,
          wsConnected: false,
        }
      };

    case ConnectionState.RESET_STATE:
      return { ...initialConnectionState };

    default:
      return state;
  }
}
