/**
 * Radio talk logging, live listen, and website PTT were removed.
 * Pause/resume stay as no-ops so Frequency Change and staff-waiting greetings
 * can still take the guild voice connection without fighting a dispatch listener.
 */

export function isDispatchRadioMonitorPaused() {
  return false;
}

export function getDispatchRadioMonitorStatus() {
  return {
    paused: false,
    pauseReason: null,
    stopping: false,
    channelId: null,
    connectionStatus: null,
    activeTalkCount: 0,
    membersInChannel: 0,
    lastJoinAt: null,
    lastTalkStartAt: null,
    lastTalkEndAt: null,
    lastTalkUserId: null,
    talkStartCount: 0,
    talkSavedCount: 0,
  };
}

export function getDispatchRadioVoiceConnection() {
  return null;
}

export function pauseDispatchRadioMonitor() {}

export function resumeDispatchRadioMonitor() {}

export async function handleRadioTalkVoiceStateUpdate() {}

export function startDispatchRadioTalkMonitor() {
  return () => {};
}
